import requests
import threading
from server import d3_conversion_utils

geo_cache = dict()


def whois_ip(dest):
    if dest not in geo_cache:
        dest = d3_conversion_utils.target_to_ip(dest)
        if d3_conversion_utils.ip_validation_regex.match(dest):
            r = requests.get(f'http://ipwhois.app/json/{dest}')
            if r.status_code == 200:
                json = dict(r.json())
                if json.keys().__contains__('latitude'):
                    geo_cache[dest] = {
                        'lat': float(json['latitude']),
                        'lon': float(json['longitude']),
                        'org': json['org']
                    }
                else:
                    geo_cache[dest] = {
                        'lat': None,
                        'lon': None,
                        'org': None
                    }
    return geo_cache[dest]


def ip_to_geo(dest):
    if d3_conversion_utils.ip_validation_regex.match(dest):
        r = requests.get(f'http://ip-api.com/json/{dest}', timeout=5)
        if r.status_code == 200:
            json = dict(r.json())
            if json.keys().__contains__('lat'):
                return {
                    'lat': json['lat'],
                    'lon': json['lon'],
                    'city': json['city'],
                    'region': json['region']
                }
    return {
        'lat': None,
        'lon': None,
        'city': None,
        'region': None
    }


def add_geo_info_naive(d3_json):
    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            if packet.get('ip'):
                geo_info = ip_to_geo(packet['ip'])
                if geo_info['lat'] is not None:
                    packet['lon'] = geo_info['lon']
                    packet['lat'] = geo_info['lat']
                    packet['city'] = geo_info['city']
                    packet['region'] = geo_info['region']
    return d3_json


def add_geo_info_tw(packet):
    if packet.get('ip'):
        res = ip_to_geo(packet['ip'])
        if res is not None:
            packet['lon'] = res['lon']
            packet['lat'] = res['lat']
            packet['city'] = res['city']
            packet['region'] = res['region']
    else:
        packet['lon'] = None
        packet['lat'] = None
        packet['city'] = None
        packet['region'] = None


def add_geo_info_threaded(d3_json):
    threads = []
    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            thread = threading.Thread(target=add_geo_info_tw, args=(packet,))
            threads.append(thread)
            thread.start()
    for thread in threads:
        thread.join()

    for tr in d3_json['traceroutes']:
        # Use the UU Bookstore as an arbitrary "default" until a better one is found
        last_known = {
            'lon': 40.7637,
            'lat': -111.8475,
            'city': 'Salt Lake City',
            'region': 'UT'
        }

        # TODO: Assign undefined packets as average of the previous and next defined ones.
        for packet in tr['packets']:
            if packet['lon'] is not None:
                last_known['lon'] = packet['lon']
                last_known['lat'] = packet['lat']
                last_known['city'] = packet['city']
                last_known['region'] = packet['region']
            else:
                packet['lon'] = last_known['lon']
                packet['lat'] = last_known['lat']
                packet['city'] = last_known['city']
                packet['region'] = last_known['region']

    return d3_json
