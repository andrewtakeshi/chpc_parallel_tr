"""
Author: Andrew Golightly
Deprecated - see d3_stardust instead. Functionally the two are the same, however due to ESNet deprecating the Netbeam
API we have moved to Stardust, their Elasticsearch based replacement for Netbeam.
"""
import sqlite3
import threading
from datetime import datetime

import requests

from server import config


def tsds_query_template(ip, base_url='https://snapp-services.grnoc.iu.edu/iu/services/query.cgi?method=query;'):
    query = f'{base_url}query=' \
            f'get aggregate(values.input, 60, average) as in_bits, ' \
            f'aggregate(values.output, 60, average) as out_bits, ' \
            f'aggregate(values.inUcast, 60, average) as in_ucast, ' \
            f'aggregate(values.outUcast, 60, average) as out_ucast, ' \
            f'aggregate(values.inerror, 60, average) as in_errors, ' \
            f'aggregate(values.outerror, 60, average) as out_errors, ' \
            f'node, intf, description, interface_address.value ' \
            f'between(now - 15m, now) ' \
            f'by node, intf, interface_address.value ' \
            f'from interface where interface_address.value = "{ip}"'
    return query

    # Discard information unavailable from TSDS right now.
    # f'aggregate(values.indiscard, 60, average) as in_discards,' \
    # f'aggregate(values.outdiscard, 60, average) as out_discards' \


def add_tsds_info_threaded(d3_json, db_path=None):
    if db_path is None:
        db_path = config.variables['tsds_db_file']

    con = sqlite3.connect(db_path)

    threads = []
    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if packet.get('ip'):
                db_result = con.execute('select * from resources where ip=:ip', packet).fetchone()
                # Exists in the db
                if db_result:
                    tsds_enabled = db_result[1]
                    last_time = datetime.strptime(db_result[2], '%Y-%m-%d %H:%M:%S')
                    # Check to see if needs refresh
                    if datetime.utcnow().timestamp() - last_time.timestamp() > config.variables[
                        'tsds_refresh_interval']:
                        thread = threading.Thread(target=tsds_db_tw, args=(packet, True, True, db_path))
                        thread.start()
                        threads.append(thread)
                    # Refresh isn't needed
                    else:
                        # Query information
                        if tsds_enabled:
                            thread = threading.Thread(target=tsds_db_tw, args=(packet, True, False, db_path))
                            thread.start()
                            threads.append(thread)
                # Does not exist in db
                else:
                    # Add IP to database
                    thread = threading.Thread(target=tsds_db_tw, args=(packet, False, True, db_path))
                    thread.start()
                    threads.append(thread)

    con.close()

    for thread in threads:
        thread.join()


def tsds_db_setup(db_path=None):
    if db_path is None:
        db_path = config.variables['tsds_db_file']

    con = sqlite3.connect(db_path)
    cur = con.cursor()
    cur.execute(
        'CREATE TABLE resources (ip text primary key not null, tsds_enabled integer, last_modified datetime default '
        'current_timestamp)')
    con.commit()
    con.close()


def tsds_db_tw(packet, existing, modify_db, db_path=None):
    """
    :param packet: Packet from the traceroute
    :param existing: Boolean - true if this ip exists in the db.
    :param modify_db: Boolean - true if the operation needs to modify db (i.e. existing == false OR last modified past
    threshold)
    :param db_path: Path to database. If it is None (i.e. default) it gets set to the config file db path.
    :return: None - modifies packet directly.
    """
    ip = packet.get('ip')
    # r = requests.get(tsds_query_template(ip, 'https://services.tsds.wash2.net.internet2.edu/community/services/query.cgi?method=query;'), timeout=5).json()
    r = requests.get(tsds_query_template(ip,
                                         'https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi/services/query.cgi?method=query;'),
                     timeout=5).json()
    tsds_enabled = len(r['results']) > 0

    traffic_info = {}

    if tsds_enabled:
        results = r['results'][0]
        if 'in_bits' in results:
            for entry in results['in_bits']:
                ts_str = str(entry[0])
                traffic_info[ts_str] = {}
                traffic_info[ts_str]['ts'] = entry[0]
                traffic_info[ts_str]['traffic_in'] = entry[1]
        if 'out_bits' in results:
            for entry in results['out_bits']:
                traffic_info[str(entry[0])]['traffic_out'] = entry[1]
        if 'in_ucast' in results:
            for entry in results['in_ucast']:
                traffic_info[str(entry[0])]['unicast_packets_in'] = entry[1]
        if 'out_ucast' in results:
            for entry in results['out_ucast']:
                traffic_info[str(entry[0])]['unicast_packets_out'] = entry[1]
        if 'in_errors' in results:
            for entry in results['in_errors']:
                traffic_info[str(entry[0])]['errors_in'] = entry[1]
        if 'out_errors' in results:
            for entry in results['out_errors']:
                traffic_info[str(entry[0])]['errors_out'] = entry[1]

        packet['traffic_info'] = traffic_info

    if modify_db:
        if db_path is None:
            db_path = config.variables['tsds_db_file']
        con = sqlite3.connect(db_path)

        if existing:
            con.execute(
                'UPDATE resources SET tsds_enabled=:tsds_enabled, last_modified=CURRENT_TIMESTAMP WHERE ip=:ip',
                {'tsds_enabled': tsds_enabled, 'ip': ip})
        else:
            con.execute('INSERT INTO resources (ip, tsds_enabled) VALUES(:ip, :tsds_enabled)',
                        {'tsds_enabled': tsds_enabled, 'ip': ip})
        con.commit()
        con.close()
