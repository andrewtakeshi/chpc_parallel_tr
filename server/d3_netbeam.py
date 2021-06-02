from os import path, stat
import json
import time
import threading
import requests
import re

url = "http://netbeam.es.net"

# TODO: Remove this and use isodate library with ISO 8601 formatted durations instead.
def time_interval(interval="15m", start_time=time.time()):
    """
    Takes a time interval and returns the unix time values (in ms) corresponding to the edges of the time interval.
    Time intervals follow the standard format, i.e. a number followed by a single character signifying a unit of
    measurement.
    Units of measurements include s (seconds), m (minutes), h (hours), d (days), and w (weeks).
    Other units (months, years, decades, etc.) could be added but I'm not sure if they're supported by the API,
    and for the use case it seems unreasonably long.
    :param interval: Relative time interval. Defaults to 15 minutes (15m).
    :param start_time: Starting? point for the relative time interval. Defaults to the current time. Without any
    parameters, the function will return the current time and the time corresponding to 15 minutes before the current
    time.
    :return: Returns a tuple. The first value corresponds to the beginning time (i.e. 15 minutes before current time)
    and the second value corresponds to the ending time (i.e. current time).
    If an invalid time period is specified, it returns none.
    """

    split = re.split('([a-zA-Z])', interval)

    if re.match('s', split[1], re.IGNORECASE):
        mult = 1
    elif re.match('m', split[1], re.IGNORECASE):
        mult = 60
    elif re.match('h', split[1], re.IGNORECASE):
        mult = 60 ** 2
    elif re.match('d', split[1], re.IGNORECASE):
        mult = 60 ** 2 * 24
    elif re.match('w', split[1], re.IGNORECASE):
        mult = 60 ** 2 * 24 * 7
    else:
        return 'Unsupported time period'

    if mult != 0:
        end_time = time.time() * 1000
        begin = end_time - (int(split[0]) * mult * 1000)
        return begin, end_time


def ip_to_resource_dict(filePath=None):
    if filePath is None:
        f = open("interfaces.json", "wt")
    else:
        f = open(filePath, "wt")

    res = {}

    try:
        r = requests.get(f"{url}/api/network/esnet/prod/interfaces", timeout=5)

        if r.status_code == 200:
            for item in r.json():
                if item['ipv4'] is not None:
                    res[item['ipv4']] = \
                        {
                            'resource': item['resource'],
                            'speed': item['speed']
                        }

        for key in res.keys():
            if res.get(key)['speed'] is not None:
                res.get(key)['speed'] = res.get(key)['speed'] * 1000000

        f.write(json.dumps(res))
        return
    except requests.exceptions.Timeout:
        return


def netbeam_traffic_by_time_range(resource: str = "devices/wash-cr5/interfaces/to_wash-bert1_ip-a",
                                  interval: str = "15m"):
    """
    Gets an interfaces traffic in a certain time range.
    :param resource: Only has a default value for testing purposes. This should be changed.
    Resource is specified in the format given by the API, i.e. devices/{host}/interfaces/{interface}.
    Resources can be gathered by looking at the file created by calling getInterfaces(True). Interfaces without a link
    speed aren't queryable (at least in my experience thus far), and calling getInterfaces(True) doesn't record the
    interfaces without reported link speeds.
    This will also work for SAPs. Resource for SAPs is devices/{host}/saps/{sap}.
    SAP resources can be gathered by looking at the file created by calling getSAPS(True). Same thing applies to SAPs as
    resources.
    :param interval: Defaults to 15m. See timeInterval definition for acceptable time range formats.
    :return: Void. Prints values for the specified time interval in 30s increments.
    """

    # Request traffic, unicast packets, # discards, # errors through the API.
    request_types = ["traffic", "unicast_packets", "discards", "errors"]
    units = [True, False, False, False]
    proper_names = ["Traffic", "Unicast Packets", "Discards", "Errors"]

    # API endpoint is nearly identical for all the different things; only differs @ requestType.
    request_str = lambda request_type: f"{url}/api/network/esnet/prod/{resource}/{request_type}?begin={begin}&end={end}"

    begin, end = time_interval(interval=interval)

    res = {}

    # rInfo = something like [traffic, True, Traffic]
    for rInfo in zip(request_types, units, proper_names):
        try:
            r = requests.get(request_str(rInfo[0]), timeout=5)

            if r.status_code == 200 and len(r.content) != 0:
                res[rInfo[0]] = r.json()
            else:
                return None
        except requests.exceptions.Timeout:
            print(f'{resource} timed out')
            return None

    return res


def add_netbeam_info_naive(d3_json, source_path=None):
    if source_path is None:
        source_path = 'interfaces.json'
    if not path.exists(source_path):
        ip_to_resource_dict(source_path)

    if time.time() - stat(source_path).st_mtime > 60 * 60 * 24:
        ip_to_resource_dict(source_path)

    netbeam_cache = json.loads(open(source_path, 'r').read())

    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            if netbeam_cache.get(packet.get('ip')):
                netbeam_item = netbeam_cache[packet['ip']]
                packet['resource'] = netbeam_item['resource']
                packet['speed'] = netbeam_item['speed']
                res = netbeam_traffic_by_time_range(netbeam_item['resource'])
                if res is not None:
                    packet['traffic'] = res['traffic']['points']
                    packet['unicast_packets'] = res['unicast_packets']['points']
                    packet['discards'] = res['discards']['points']
                    packet['errors'] = res['errors']['points']

    return d3_json


def add_netbeam_info_tw(packet, netbeam_item):
    packet['resource'] = netbeam_item['resource']
    packet['speed'] = netbeam_item['speed']
    res = netbeam_traffic_by_time_range(netbeam_item['resource'])
    if res is not None:
        packet['traffic'] = res['traffic']['points']
        packet['unicast_packets'] = res['unicast_packets']['points']
        packet['discards'] = res['discards']['points']
        packet['errors'] = res['errors']['points']


def add_netbeam_info_threaded(d3_json, source_path=None):
    threads = []

    if source_path is None:
        source_path = 'interfaces.json'
    if not path.exists(source_path):
        ip_to_resource_dict(source_path)

    if time.time() - stat(source_path).st_mtime > 60 * 60 * 24:
        ip_to_resource_dict(source_path)

    netbeam_cache = json.loads(open(source_path, 'r').read())

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if netbeam_cache.get(packet.get('ip')):
                thread = threading.Thread(target=add_netbeam_info_tw, args=(packet, netbeam_cache[packet['ip']]))
                threads.append(thread)
                thread.start()

    for thread in threads:
        thread.join()

    return d3_json
