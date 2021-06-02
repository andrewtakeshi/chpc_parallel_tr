import requests
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

"""
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
"""


def add_geo_info_naive(d3_json):
    for traceroute in d3_json['traceroutes']:
        for packet in traceroute['packets']:
            if packet.get('ip'):
                geo_info = ip_to_geo(packet['ip'])
                if geo_info['lat'] is not None:
                    packet['lat'] = geo_info['lat']
                    packet['lon'] = geo_info['lon']
    return d3_json
