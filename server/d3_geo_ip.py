"""
Author: Andrew Golightly
"""
import requests
import threading
import re
from server import d3_conversion_utils, config

geo_cache = dict()

# Matches private IP Addresses; we don't want to look up the Geo IP information for these.
# This has been validated to only cover these ranges - this is available in test.py, but it takes forever to run.
# In short, this covers 10.0.0.0-10.255.255.255 (10.0.0.0/8), 172.16.0.0 - 172.31.255.255 (172.16.0.0/12), and
# 192.168.0.0 - 192.168.255.255 (192.168.0.0/16).
private_ip = re.compile(r'^(10\.((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.){2}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|'
                        r'[1-9][0-9]|[0-9]))|(192\.168\.((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.)(25[0-5]|'
                        r'2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9]))|(172\.(1[6-9]|2[0-9]|3[0-1])\.(25[0-5]|2[0-4][0-9]|'
                        r'1[0-9]{2}|[1-9][0-9]|[0-9])\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9]))$')


def whois_ip(dest):
    """
    Lookup using whois and a cache.
    :param dest: Target IP address.
    :return: JSON with geoIP information + org.
    """
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
    """
    Lookup using ip-api.com.
    :param dest: Target IP address.
    :return: JSON with geoIP info.
    """
    not_found = {
        'lat': None,
        'lon': None,
        'city': None,
        'region': None
    }
    if private_ip.match(dest):
        return not_found
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
    return not_found


def add_geo_info_naive(d3_json):
    """
    Single threaded method for adding geoIP information.
    :param d3_json: JSON ingestible by d3. Modified in place.
    """
    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            add_geo_info_tw(packet)


def add_geo_info_tw(packet):
    """
    Per thread work to add geoIP information to a single packet.
    :param packet: Packet to add geoIP info to.
    """
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
    """
    Multithreaded version to add geo info.
    :param d3_json: Traceroute json - formatted by d3_conversion.system_to_d3_*
    """
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
        last_known = config.variables['default_location']

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
