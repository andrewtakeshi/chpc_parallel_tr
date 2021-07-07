from server import d3_conversion as d3c
from server import d3_conversion_utils
from server import d3_netbeam
from server import d3_geo_ip
import time
import difflib
import datetime
import sqlite3
import requests
import json
from server.d3_netbeam import ip_to_resource_dict
from server.d3_netbeam import ip_to_netbeam_db
from server.d3_netbeam import add_netbeam_info_db_naive

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

d3_json = {'traceroutes': [{'ts': 1624404238, 'source_address': '199.192.103.26', 'target_address': '134.55.200.107',
                            'packets': [{'ttl': 0, 'ip': '199.192.103.26', 'rtt': 0},
                                        {'ttl': 1, 'ip': '192.168.0.1', 'rtt': 0.497}, {'ttl': 2}, {'ttl': 3},
                                        {'ttl': 4, 'ip': '162.252.180.54', 'rtt': 3.617},
                                        {'ttl': 5, 'ip': '206.81.81.102', 'rtt': 23.235},
                                        {'ttl': 6, 'ip': '134.55.42.38', 'rtt': 46.971},
                                        {'ttl': 7, 'ip': '134.55.49.58', 'rtt': 56.925},
                                        {'ttl': 8, 'ip': '134.55.43.81', 'rtt': 67.723},
                                        {'ttl': 9, 'ip': '134.55.36.46', 'rtt': 82.676},
                                        {'ttl': 10, 'ip': '134.55.200.107', 'rtt': 83.436}]}]}

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

limit = 100

dict_time = 0
db_time = 0

for _ in range(limit):
    st = time.time()
    d3_netbeam.add_netbeam_info_threaded(d3_json)
    dict_time += time.time() - st
    st = time.time()
    d3_netbeam.add_netbeam_info_db_threaded(d3_json)
    db_time += time.time() - st
print(f'dict time = {dict_time / limit}')
print(f'db time = {db_time / limit}')
