"""
Used in conjunction with d3_conversion.py to add information from ESNet hosts running the Netbeam data collection API to
traceroute data.
"""

from os import path, stat
import json
import time
import threading
import requests
import re
import sqlite3
import calendar

NETBEAM_URL = "http://netbeam.es.net"


##################
##### COMMON #####
##################

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


def netbeam_traffic_by_time_range(resource: str, interval: str = "15m"):
    """
    Gets an interfaces traffic in a certain time range.

    :param resource: Resource is specified in the format given by the API, i.e. devices/{host}/interfaces/{interface}.
    Resources can be gathered by looking at the file created by calling getInterfaces(True). Interfaces without a link
    speed aren't queryable (at least in my experience thus far), and calling getInterfaces(True) doesn't record the
    interfaces without reported link speeds.
    This will also work for SAPs. Resource for SAPs is devices/{host}/saps/{sap}.
    SAP resources can be gathered by looking at the file created by calling getSAPS(True). Same thing applies to SAPs as
    resources.
    :param interval: Defaults to 15m. See timeInterval definition for acceptable time range formats.
    :return: Dictionary that maps request_type => [values], i.e. { traffic : [...], discards : [...], ... }
    """

    # Request traffic, unicast packets, # discards, # errors through the API.
    request_types = ["traffic", "unicast_packets", "discards", "errors"]
    units = [True, False, False, False]
    proper_names = ["Traffic", "Unicast Packets", "Discards", "Errors"]

    # API endpoint is nearly identical for all the different things; only differs @ requestType. Use a lambda so we can
    # use the same call for the different endpoints.
    request_str = lambda \
            request_type: f"{NETBEAM_URL}/api/network/esnet/prod/{resource}/{request_type}?begin={begin}&end={end}"

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


def add_netbeam_info_tw(packet, netbeam_item):
    """
    Adds netbeam information given the netbeam_cache entry and a single packet. Helper function for both the naive and
    threaded implementations for both styles of lookup.

    :param packet: Packet from the traceroute data (d3_json)
    :param netbeam_item: netbeam_cache resource corresponding to the packet's IP.
    :return: None - the dictionary is altered in place.
    """
    packet['resource'] = netbeam_item['resource']
    packet['speed'] = netbeam_item['speed']
    res = netbeam_traffic_by_time_range(netbeam_item['resource'])
    if res is not None:
        packet['traffic'] = res['traffic']['points']
        packet['unicast_packets'] = res['unicast_packets']['points']
        packet['discards'] = res['discards']['points']
        packet['errors'] = res['errors']['points']


#################
##### JSON ######
#################

def ip_to_resource_dict(filePath=None):
    """
    Convert the result from ${netbeam}/api/network/esnet/prod/interfaces to a json file specified by filePath.

    This is used to find IP's from the traceroute that are monitored by Netbeam, which can then be polled for more
    information.

    :param filePath: Path to the file. By default this is interfaces.json.
    :return: None
    """
    if filePath is None:
        f = open("interfaces.json", "wt")
    else:
        f = open(filePath, "wt")

    res = {}

    try:
        r = requests.get(f"{NETBEAM_URL}/api/network/esnet/prod/interfaces", timeout=5)

        if r.status_code == 200:
            for item in r.json():
                # We only care about the link speed and the resource name - this is mapped to a dictionary (ip => prop)
                # that is later used to lookup the resource names and the link speeds, when applicable.
                if item['ipv4'] is not None:
                    res[item['ipv4']] = \
                        {
                            'resource': item['resource'],
                            'speed': item['speed']
                        }

        # Convert the speed to correct values. This can be verified by comparing link speed values found here to those
        # found on my.es.net.
        for key in res.keys():
            if res.get(key)['speed'] is not None:
                res.get(key)['speed'] = res.get(key)['speed'] * 1000000

        f.write(json.dumps(res))
        return
    except requests.exceptions.Timeout:
        return


def load_netbeam_cache(source_path):
    """
    Creates, modifies, or reads the json file specified in source_path with the results of
    ${netbeam}/api/network/esnet/prod/interfaces; this is a list of the existing interfaces + mappings to their IP
    addresses. IP's from the traceroute are matched against this DB to gather the information from the Netbeam API.

    The json file is created if it doesn't exist, modified (recreated) if there are errors or if it has been > 24 hours
    since the last modification. Otherwise, the file is read and the contents are returned as a dictionary of
    ip => resource_values.

    If source path is None, then the default source path ./interface.json is used.

    :param source_path: path to the json file containing ESNet Netbeam Host interface information.
    :return: Dictionary that maps IP => { resource : <value>, speed : <value> }.
    """
    if source_path is None:
        source_path = 'interfaces.json'
    if not path.exists(source_path):
        ip_to_resource_dict(source_path)

    if time.time() - stat(source_path).st_mtime > 60 * 60 * 24:
        ip_to_resource_dict(source_path)

    try:
        netbeam_cache = json.loads(open(source_path, 'r').read())
    except json.decoder.JSONDecodeError:
        ip_to_resource_dict(source_path)
        netbeam_cache = json.loads(open(source_path, 'r').read())

    return netbeam_cache


def add_netbeam_info_naive(d3_json, source_path=None):
    """
    Single threaded implementation for adding Netbeam information to a traceroute.

    :param d3_json: Dictionary containing the traceroute information. Called d3_json because it is later used by d3.js
    to create the web visualization.
    :param source_path: Path to the netbeam interface file; by default this is ./interfaces.json.
    """
    netbeam_cache = load_netbeam_cache(source_path)

    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            if netbeam_cache.get(packet.get('ip')):
                netbeam_item = netbeam_cache[packet['ip']]
                add_netbeam_info_tw(packet, netbeam_item)


def add_netbeam_info_threaded(d3_json, source_path=None):
    """
    Threaded implementation for adding netbeam information to a traceroute. This does the netbeam_cache lookup and
    spawns the child threads. Each child thread runs add_netbeam_info_tw, which allows the queries against the Netbeam
    API for more information (i.e. speed, discards, errors, and unicast_packets) to happen in parallel; this saves
    a significant amount of time when compared to the serial (naive) version.

    :param d3_json: Dictionary containing the traceroute information. Called d3_json because it is later used by d3.js
    to create the web visualization.
    :param source_path: Path to the netbeam interface file; by default this is ./interfaces.json.
    """
    threads = []

    netbeam_cache = load_netbeam_cache(source_path)

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if netbeam_cache.get(packet.get('ip')):
                # Each thread runs add_netbeam_info_tw
                thread = threading.Thread(target=add_netbeam_info_tw, args=(packet, netbeam_cache[packet['ip']]))
                threads.append(thread)
                thread.start()

    # Wait for all threads to finish before returning; we don't need to worry about race conditions or any kind of
    # concurrent modification because each thread works on separate data.
    for thread in threads:
        thread.join()


##################
###### DB ########
##################

def refresh_netbeam_db(db_path):
    """
    Experimental and likely buggy. Replaces ip_to_resource_dict.

    Creates or modifies an existing db (indicated by db_path) with the results of
    ${netbeam}/api/network/esnet/prod/interfaces; this is a list of the existing interfaces + mappings to their IP
    addresses. IP's from the traceroute are matched against this DB to gather the information from the Netbeam API.

    No longer under development because in preliminary testing (for the size of the data) it was significantly slower
    than using an in-memory dictionary as used in ip_to_resource_dict.

    :param db_path: Path to the database
    :return: None
    """
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    try:
        r = requests.get(f"{NETBEAM_URL}/api/network/esnet/prod/interfaces", timeout=5)
        for resource in r.json():
            if resource['ipv4']:
                try:
                    cur.execute('insert into resources values (?, ?, ?, current_timestamp)',
                                (resource['ipv4'], resource['resource'],
                                 resource['speed'] * 1000000 if resource['speed'] else None))
                except sqlite3.IntegrityError:
                    continue
        con.commit()
        con.close()
    except requests.exceptions.Timeout:
        return


def ip_to_netbeam_db(db_path='netbeam_ip_map.db'):
    """
    Wrapper around refresh_netbeam_db. Automatically creates the db if it doesn't exist or refreshes it if it's been >
    24 hours since the last refresh.

    :param db_path: Path to the database file; by default this is netbeam_ip_map.db.
    :return: None
    """
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Create db if it doesn't exist.
    try:
        cur.execute('select * from resources limit 1')
    except sqlite3.OperationalError as e:
        cur.execute(
            'create table resources (ip text primary key not null, resource text, '
            'speed numeric, timestamp datetime default current_timestamp)')
        con.commit()
        con.close()
        refresh_netbeam_db(db_path)
        return

    # Refresh db if it's been 24+ hours since last modification or if there's an error getting the last timestamp.
    time_format = '%Y-%m-%d %H:%M:%S'

    last_time = cur.execute('select timestamp from resources order by timestamp limit 1').fetchone()[0]
    con.commit()
    con.close()

    if not last_time:
        refresh_netbeam_db(db_path)
        return

    last_time = time.strptime(last_time, time_format)

    if time.time() - calendar.timegm(last_time) > 60 * 60 * 24:
        refresh_netbeam_db(db_path)
        return


def add_netbeam_info_db_naive(d3_json, db_path='netbeam_ip.db'):
    """
    Naive implementation to add Netbeam data to a traceroute.

    :param d3_json: Traceroute dictionary.
    :param db_path: Path to database file with Netbeam interface information.
    """
    ip_to_netbeam_db(db_path)

    con = sqlite3.connect(db_path)
    cur = con.cursor()

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if packet.get('ip'):
                db_result = cur.execute('select * from resources where ip=(?)', (packet['ip'],)).fetchone()
                if db_result:
                    packet['resource'] = db_result[1]
                    packet['speed'] = db_result[2]
                    res = netbeam_traffic_by_time_range(db_result[1])
                    if res is not None:
                        packet['traffic'] = res['traffic']['points']
                        packet['unicast_packets'] = res['unicast_packets']['points']
                        packet['discards'] = res['discards']['points']
                        packet['errors'] = res['errors']['points']

    con.close()


def add_netbeam_info_db_threaded(d3_json, db_path='netbeam_ip.db'):
    """
    Threaded implementation to add Netbeam data to a traceroute.

    :param d3_json: Traceroute dictionary.
    :param db_path: Path to database file with Netbeam interface information.
    :return: Modified copy of the dictionary that was originally passed in.
    """
    ip_to_netbeam_db(db_path)

    con = sqlite3.connect(db_path)
    cur = con.cursor()

    threads = []

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if packet.get('ip'):
                db_result = cur.execute('select * from resources where ip=(?)', (packet['ip'],)).fetchone()
                if db_result:
                    netbeam_item = {
                        'resource': db_result[1],
                        'speed': db_result[2]
                    }
                    thread = threading.Thread(target=add_netbeam_info_tw, args=(packet, netbeam_item))
                    threads.append(thread)
                    thread.start()

    for thread in threads:
        thread.join()

    con.close()
