"""
Author: Andrew Golightly
Module for getting information from IU/GRNOCs TSDS.
TSDS Browser can be found @ https://tsds.wash2.net.internet2.edu/community/?method=browse&measurement_type=interface
"""
import sqlite3
import threading
from datetime import datetime

import requests

from server import config


def tsds_query_template(ip,
                        base_url='https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi/services/query.cgi?method=query;'):
    """
    :param ip: IP address we want to get more info for.
    :param base_url: TSDS URL. By default it queries tsds-cross-domain, which should check all available TSDS instances.
    :return: Properly formatted URL.
    """
    query = f'{base_url}query=get ' \
            f'aggregate(values.input, 60, average) as traffic_in, ' \
            f'aggregate(values.output, 60, average) as traffic_out, ' \
            f'aggregate(values.inUcast, 60, average) as unicast_packets_in, ' \
            f'aggregate(values.outUcast, 60, average) as unicast_packets_out, ' \
            f'aggregate(values.inerror, 60, average) as errors_in, ' \
            f'aggregate(values.outerror, 60, average) as errors_out, ' \
            f'node, intf, description, interface_address.value ' \
            f'between(now - 15m, now) ' \
            f'by node, intf, interface_address.value ' \
            f'from interface where interface_address.value = "{ip}"'
    return query

    # Discard information unavailable from TSDS right now - shows as null.
    # f'aggregate(values.indiscard, 60, average) as discards_in,' \
    # f'aggregate(values.outdiscard, 60, average) as discards_out' \


def add_tsds_info_threaded(tr_data):
    """
    Adds TSDS information to traceroute data, if applicable.
    :param tr_data: Dictionary containing the traceroute data. 
    :param db_path: Path to database. If None, then it uses the config file db path.
    :return: None. Modifies tr_data directly.
    """
    db_path = config.variables['tsds_db_file']

    # Open connection to db.
    con = sqlite3.connect(db_path)

    # Create list of threads
    threads = []
    for tr in tr_data['traceroutes']:
        for packet in tr['packets']:
            # Skip over packets that do not have an IP address.
            if packet.get('ip'):
                # Check to see if IP address is already in database.
                db_result = con.execute('select * from resources where ip=:ip', packet).fetchone()
                if db_result:
                    tsds_enabled = db_result[1]
                    last_time = datetime.strptime(db_result[2], '%Y-%m-%d %H:%M:%S')
                    # Check to see if the database entry needs to be refreshed.
                    # If it does, we run tsds_db_tw with existing and modify_db set to true.
                    if datetime.utcnow().timestamp() - last_time.timestamp() > \
                            config.variables['tsds_refresh_interval']:
                        thread = threading.Thread(target=tsds_db_tw, args=(packet, True, True, db_path))
                        thread.start()
                        threads.append(thread)
                    # Refresh isn't needed
                    else:
                        # We don't need to modify the db in this case, so we run tsds_db_tw with existing true and
                        # modify_db false.
                        if tsds_enabled:
                            thread = threading.Thread(target=tsds_db_tw, args=(packet, True, False, db_path))
                            thread.start()
                            threads.append(thread)
                # Does not exist in db
                else:
                    # Add IP to database by running tsds_db_tw with existing set to false and modify_db set to true
                    thread = threading.Thread(target=tsds_db_tw, args=(packet, False, True, db_path))
                    thread.start()
                    threads.append(thread)

    con.close()

    for thread in threads:
        thread.join()


def tsds_db_setup():
    """
    Create the database table with the appropriate schema.
    :param db_path: Path to the database file. If None, uses the path from the config file.
    :return: None.
    """
    db_path = config.variables['tsds_db_file']
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    res = cur.execute("SELECT name FROM sqlite_master WHERE TYPE='table' AND NAME='resources'").fetchone()
    # create table if it doesn't exist
    if not res:
        cur.execute(
            'CREATE TABLE resources (ip text primary key not null, tsds_enabled integer, last_modified datetime default '
            'current_timestamp)')
    con.commit()
    con.close()


def tsds_db_tw(packet, existing, modify_db, db_path):
    """
    Always checks the IP address to see if it's part of the TSDS. If it is, this parses the TSDS data and adds it to the
    packet.
    :param packet: Dictionary - Packet from the traceroute.
    :param existing: Boolean - true if this ip exists in the db.
    :param modify_db: Boolean - true if the operation needs to modify db (i.e. existing == false OR last modified past
    threshold)
    :param db_path: Path to database. If it is None (i.e. default) it gets set to the config file db path.
    :return: None - modifies packet directly.
    """
    ip = packet.get('ip')
    r = requests.get(tsds_query_template(ip), timeout=5).json()
    tsds_enabled = len(r['results']) > 0

    # If IP is part of TSDS, parse info and add to the packet.
    if tsds_enabled:
        traffic_info = {}
        results = r['results'][0]
        metrics = ['traffic_in', 'traffic_out', 'unicast_packets_in', 'unicast_packets_out', 'errors_in', 'errors_out']
        for metric in metrics:
            if metric in results:
                for entry in results[metric]:
                    ts_str = str(entry[0])
                    if ts_str not in traffic_info:
                        traffic_info[ts_str] = {}
                        traffic_info[ts_str]['ts'] = entry[0]
                    traffic_info[ts_str][metric] = entry[1]

        packet['traffic_info'] = traffic_info

    # We want to modify if the IP is not part of the DB already or if the last_modified is over the threshold defined
    # in the config file.
    if modify_db:
        con = sqlite3.connect(db_path)

        # Use different query for update vs insert.
        if existing:
            con.execute(
                'UPDATE resources SET tsds_enabled=:tsds_enabled, last_modified=CURRENT_TIMESTAMP WHERE ip=:ip',
                {'tsds_enabled': tsds_enabled, 'ip': ip})
        else:
            con.execute('INSERT INTO resources (ip, tsds_enabled) VALUES(:ip, :tsds_enabled)',
                        {'tsds_enabled': tsds_enabled, 'ip': ip})
        con.commit()
        con.close()


# Call setup whenever we load this file
tsds_db_setup()
