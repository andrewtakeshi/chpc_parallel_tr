import json
import time

from server import d3_tsds, d3_conversion

# diff = difflib.Differ()
#
# dest = '8.8.8.8'
# dest = '155.101.8.18'
#
# st = time.time()
# old = d3c.system_to_d3_old(dest, 10)
# print(time.time() - st)
# st = time.time()
# new = d3c.system_to_d3_old_threaded(dest, 10)
# print(time.time() - st)
#
# print(old)
# print(new)

# print(d3_conversion_utils.ip_to_geo('155.101.8.18'))

# d3_json = {'traceroutes': [{'ts': 1624404238, 'source_address': '199.192.103.26', 'target_address': '134.55.200.107',
#                             'packets': [{'ttl': 0, 'ip': '199.192.103.26', 'rtt': 0},
#                                         {'ttl': 1, 'ip': '192.168.0.1', 'rtt': 0.497}, {'ttl': 2}, {'ttl': 3},
#                                         {'ttl': 4, 'ip': '162.252.180.54', 'rtt': 3.617},
#                                         {'ttl': 5, 'ip': '206.81.81.102', 'rtt': 23.235},
#                                         {'ttl': 6, 'ip': '134.55.42.38', 'rtt': 46.971},
#                                         {'ttl': 7, 'ip': '134.55.49.58', 'rtt': 56.925},
#                                         {'ttl': 8, 'ip': '134.55.43.81', 'rtt': 67.723},
#                                         {'ttl': 9, 'ip': '134.55.36.46', 'rtt': 82.676},
#                                         {'ttl': 10, 'ip': '134.55.200.107', 'rtt': 83.436}]}]}

d3_json = {'traceroutes': [{'ts': 1643913620, 'source_address': '192.168.1.121', 'target_address': '134.55.220.77',
                            'packets': [{'ttl': 0, 'ip': '192.168.1.121', 'rtt': 0},
                                        {'ttl': 1, 'ip': '192.168.1.1', 'rtt': 0.51}, {'ttl': 2}, {'ttl': 3},
                                        {'ttl': 4, 'ip': '162.252.180.54', 'rtt': 3.241},
                                        {'ttl': 5, 'ip': '206.81.81.102', 'rtt': 39.399},
                                        {'ttl': 6, 'ip': '134.55.56.15', 'rtt': 38.692},
                                        {'ttl': 7, 'ip': '134.55.57.44', 'rtt': 48.453},
                                        {'ttl': 8, 'ip': '134.55.56.242', 'rtt': 52.209},
                                        {'ttl': 9, 'ip': '134.55.56.163', 'rtt': 65.207},
                                        {'ttl': 10, 'ip': '134.55.56.12', 'rtt': 151.206},
                                        {'ttl': 11, 'ip': '134.55.220.77', 'rtt': 151.613}]}]}

# print(d3c.system_to_d3_old('8.8.8.8'))

# print(d3_geo_ip.whois('8.8.8.8'))
# print(d3_geo_ip.ip_to_geo('8.8.8.8'))
# print(d3_geo_ip.whois(d3_json))

# print(d3_geo_ip.whois_ip('208.95.112.1'))
# print(d3_geo_ip.ip_to_geo('208.95.112.1'))

url = 'http://netbeam.es.net/api/network/esnet/prod/interfaces'

"""
{'namespace': 'esnet/prod', 'resource': 'devices/albq-asw1/interfaces/pime', 'name': 'pime', 'device': 'albq-asw1', 
'ifIndex': '10', 'description': '', 'speed': None, 'vlan': None, 'port': None, 'nokiaType': None, 'visibility': 'SHOW', 
'connection': '', 'link': '', 'tags': [], 'sector': 'INTRACLOUD', 'site': '', 'lhcone': False, 'oscars': False, 
'intercloud': False, 'intracloud': False, 'remoteDevice': None, 'remotePort': None, 'ipv4': None}
"""


# st = time.time()
# con = sqlite3.connect('test.db')
# cur = con.cursor()
#
# cur.execute('drop table if exists resources')
# cur.execute(
#     'create table resources (ip text primary key not null, resource text, speed numeric, timestamp datetime default current_timestamp)')
#
# r = requests.get(url)
#
# for resource in r.json():
#     if resource['ipv4']:
#         try:
#             cur.execute('insert into resources values (?, ?, ?, current_timestamp)',
#                         (resource['ipv4'], resource['resource'],
#                          resource['speed'] * 1000000 if resource['speed'] else None))
#         except sqlite3.IntegrityError:
#             continue
#
# con.commit()
# con.close()

# print(time.time() - st)
# st = time.time()
# ip_to_resource_dict()
# print(time.time() - st)

# ip = '134.55.200.107'
# source_path = 'interfaces.json'
#
# st = time.time()
# cur.execute('select resource, speed from resources where ip = :ip', {'ip': ip})
# cur.fetchone()
# print(time.time() - st)
# st = time.time()
# netbeam_cache = json.loads(open(source_path, 'r').read())
# netbeam_cache.get(ip)
# print(time.time() - st)

# time_str = '2021-06-18 00:21:22'
# time_format = '%Y-%m-%d %H:%M:%S'
# _time = datetime.datetime.strptime(time_str, time_format)
# print(_time.timestamp())
# print(time.time())

# con = sqlite3.connect('netbeam_ip_map.db')
# cur = con.cursor()
# cur.execute('drop table if exists resources')
# con.commit()
# con.close()
# ip_to_netbeam_db()

# print(d3c.system_to_d3_old('134.55.200.107', 1))

# limit = 100
#
# dict_time = 0
# db_time = 0

# for _ in range(limit):
#     st = time.time()
#     d3_netbeam.add_netbeam_info_threaded(d3_json)
#     dict_time += time.time() - st
#     st = time.time()
#     d3_netbeam.add_netbeam_info_db_threaded(d3_json)
#     db_time += time.time() - st
# print(f'dict time = {dict_time / limit}')
# print(f'db time = {db_time / limit}')

# sub = subprocess.Popen(['pscheduler', 'task', '--debug', 'trace', '-s', '204.99.128.12', '-d', '8.8.8.8'],
#                                              stdout=subprocess.PIPE, universal_newlines=True)
# sub.wait()


# st = time.time()
# print(d3_rdap.rdap_cache_threaded(d3_json))
# print(time.time() - st)
#
# st = time.time()
# for tr in d3_json['traceroutes']:
#     for packet in tr['packets']:
#         if 'ip' not in packet:
#             continue
#         ip = packet.get('ip')
#         d3_conversion_utils.rdap_org_lookup(ip)
# print(time.time() - st)

# print(d3_rdap.rdap_cache_threaded(d3_json))
# print(d3_rdap.rdap_cache_threaded(d3_json))
# d3_conversion_utils.rdap_org_lookup('206.81.81.102')
# packet = {}
# d3_rdap.rdap_cache_tw(packet, '206.81.81.102')
# print(packet)


# Test of the private regex space - passes.
# counter = 0
# for i in range(256):
#     for j in range(256):
#         print(f'Testing {i}.{j}.x.x')
#         for k in range(256):
#             for l in range(256):
#                 if d3_geo_ip.private_ip.match(f'{i}.{j}.{k}.{l}'):
#                     if (i == 10) or (i == 172 and 16 <= j <= 31) or (i == 192 and j == 168):
#                         counter += 1
#                     else:
#                         print(f'{i}.{j}.{k}.{l}')
# print(counter)
# assert(counter == pow(2, 24) + pow(2, 20) + pow(2, 16))

# d3_json_clean = d3_json.copy()
# d3_stardust.add_sd_info_threaded(d3_json_clean)
# print(d3_json_clean)
# d3_netbeam.add_netbeam_info_threaded(d3_json)
# print(d3_json)

def pretty_print_sd_info(in_dict):
    for ts in in_dict.keys():
        key_time = time.localtime(ts / 1000)
        print(f'{key_time.tm_hour}:{format(key_time.tm_min, "02d")}:{format(key_time.tm_sec, "02d")}')
        for val in in_dict[ts].keys():
            print(f'\t{val}: {in_dict[ts][val]}')


def pretty_print_d3c_system(in_dict):
    in_dict = in_dict['traceroutes']
    for tr in in_dict:
        for k in tr.keys():
            if k == 'packets':
                packets = tr[k]
                for packet in packets:
                    for kk in packet.keys():
                        print(f'{kk}: {packet[kk]}')
                    print()


# js = json.dumps(d3_stardust.sd_traffic_by_time_range())
# pretty_print_d3_json(d3_stardust.sd_traffic_by_time_range())

# print(d3c.system_to_d3('155.101.8.18', 1))
# pretty_print_d3c_system(d3c.system_to_d3('155.101.8.18', 1))

# print(json.dumps(tst(d3_json)))
# packet = d3_json['traceroutes'][0]['packets'][5]

# print(json.dumps(d3_conversion.system_to_d3('198.124.252.102', 1)))
d3_tsds.tsds_db_setup()
# d3_tsds.tsds_db_check('8.8.8.8')
# d3_tsds.tsds_db_tw({'ip': '140.182.44.2'}, False, True)
# d3_tsds.tsds_db_tw({'ip': '8.8.8.8'}, True, False)
