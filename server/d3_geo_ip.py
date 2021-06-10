import requests
import threading
from server import d3_conversion_utils


def ip_to_geo(dest):
    if d3_conversion_utils.ip_validation_regex.match(dest):
        r = requests.get(f'http://ip-api.com/json/{dest}', timeout=5)
        if r.status_code == 200:
            json = dict(r.json())
            if json.keys().__contains__('lat'):
                return {
                    'lat': json['lat'],
                    'lon': json['lon']
                }
    return {
        'lat': None,
        'lon': None
    }


def add_geo_info_naive(d3_json):
    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            if packet.get('ip'):
                geo_info = ip_to_geo(packet['ip'])
                if geo_info['lat'] is not None:
                    packet['lon'] = geo_info['lon']
                    packet['lat'] = geo_info['lat']
    return d3_json


def add_geo_info_tw(packet):
    if packet.get('ip'):
        res = ip_to_geo(packet['ip'])
        if res is not None:
            packet['lon'] = res['lon']
            packet['lat'] = res['lat']
    else:
        packet['lon'] = None
        packet['lat'] = None


def add_geo_info_threaded(d3_json):
    threads = []
    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            thread = threading.Thread(target=add_geo_info_tw, args=(packet,))
            threads.append(thread)
            thread.start()
    for thread in threads:
        thread.join()

    i = front = back = 0

    for tr in d3_json['traceroutes']:
        # Use the UU Bookstore as an arbitrary "default" until a better one is found
        last_known = {
            'x': 40.7637,
            'y': -111.8475
        }
        # TODO: Assign undefined packets as average of the previous and next defined ones.
        for packet in tr['packets']:
            # print(i, front, back)
            if packet['lon'] is not None:
                last_known['lon'] = packet['lon']
                last_known['lat'] = packet['lat']
            else:
                packet['lon'] = last_known['lon']
                packet['lat'] = last_known['lat']

    return d3_json
