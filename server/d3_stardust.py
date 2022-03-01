import json
import stat
import threading
import time
from os import chmod, path, stat as osstat

import elasticsearch

from server import config

es = elasticsearch.Elasticsearch(hosts=['https://el.gc1.prod.stardust.es.net:9200'], timeout=30)


def sd_traffic_by_time_range(resource='lond-cr5::to_tenet_ip-b'):
    try:
        r = es.search(index='sd_public_interfaces',
                      body=
                      {
                          'size': 60,
                          '_source': False,
                          'sort': [
                              {
                                  'start': {
                                      'order': 'asc'
                                  }
                              }
                          ],
                          'fields': [
                              'values.in_bits.delta',
                              'values.out_bits.delta',

                              'values.in_discards.delta',
                              'values.out_discards.delta',

                              'values.in_errors.delta',
                              'values.out_errors.delta',

                              'values.in_ucast_pkts.delta',
                              'values.out_ucast_pkts.delta',

                              'values.in_bcast_pkts.delta',
                              'values.in_mcast_pkts.delta',

                              'values.in_pkts.delta',
                              'values.out_pkts.delta',
                          ],
                          'query': {
                              'bool': {
                                  'filter': [
                                      {'range': {'start': {
                                          'gte': 'now-15m/m',
                                          'lte': 'now'
                                      }}},
                                      {'term': {'meta.id': resource}}
                                  ]
                              }
                          }
                      })

        hits = r['hits']['hits']

        # Goes from stardust api values to the values used by d3/other vis.
        key_map = {
            'values.in_bits.delta': 'traffic_in',
            'values.out_bits.delta': 'traffic_out',

            'values.in_discards.delta': 'discards_in',
            'values.out_discards.delta': 'discards_out',

            'values.in_errors.delta': 'errors_in',
            'values.out_errors.delta': 'errors_out',

            'values.in_ucast_pkts.delta': 'unicast_packets_in',
            'values.out_ucast_pkts.delta': 'unicast_packets_out',

            'values.in_bcast_pkts.delta': 'broadcast_packets_in',
            'values.in_mcast_pkts.delta': 'multicast_packets_in',

            'values.in_pkts.delta': 'packets_in',
            'values.out_pkts.delta': 'packets_out'
        }

        ret = {}

        # No idea why, but we need to scale everything down from stardust 30x.
        denominator = 30

        for hit in hits:
            fields = hit['fields']
            keys = fields.keys()
            ts = hit['sort'][0]

            if ts not in ret.keys():
                ret[ts] = {'ts': ts}
            for key in keys:
                ret_key = key_map[key]
                if ret_key in ret[ts].keys():
                    # On 5 minute intervals (i.e. xx:00, xx:05, etc) the discards, errors, etc. are available.
                    # For whatever reason, there is a "preliminary" packet that contains roughly half the traffic
                    # information, and only the traffic information. Then, after the discards & errors are available,
                    # we get a second packet with the rest of the traffic information + the discards and everything else
                    # If we don't do the += it's just inaccurate.
                    ret[ts][ret_key] += fields[key][0]
                else:
                    ret[ts][ret_key] = fields[key][0]
        for ts in ret.keys():
            for key in ret[ts].keys():
                if key.startswith('traffic'):
                    ret[ts][key] /= denominator

        if len(ret.keys()) == 0:
            return None
        else:
            return ret

    except elasticsearch.exceptions.ConnectionTimeout:
        return None


def add_sd_info_tw(packet, sd_item):
    """
    Adds netbeam information given the netbeam_cache entry and a single packet. Helper function for both the naive and
    threaded implementations for both styles of lookup.

    :param packet: Packet from the traceroute data (d3_json)
    :param sd_item: netbeam_cache resource corresponding to the packet's IP.
    :return: None - the dictionary is altered in place.
    """
    packet['resource'] = sd_item['resource']
    packet['speed'] = sd_item['speed']
    res = sd_traffic_by_time_range(sd_item['resource'])
    if res is not None:
        packet['traffic_info'] = res


def add_sd_info_threaded(d3_json, source_path=None):
    threads = []
    sd_cache = load_stardust_file(source_path)

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if sd_cache.get(packet.get('ip')):
                # Each thread runs add_netbeam_info_tw
                thread = threading.Thread(target=add_sd_info_tw, args=(packet, sd_cache[packet['ip']]))
                threads.append(thread)
                thread.start()

        # Wait for all threads to finish before returning; we don't need to worry about race conditions or any kind of
        # concurrent modification because each thread works on separate data.
    for thread in threads:
        thread.join()


def load_stardust_file(file_path=None):
    """
        Creates, modifies, or reads the json file specified in source_path with the results of
        ${netbeam}/api/network/esnet/prod/interfaces; this is a list of the existing interfaces + mappings to their IP
        addresses. IP's from the traceroute are matched against this DB to gather the information from the Netbeam API.

        The json file is created if it doesn't exist, modified (recreated) if there are errors or if it has been > 24 hours
        since the last modification. Otherwise, the file is read and the contents are returned as a dictionary of
        ip => resource_values.

        If source path is None, then the default source path ./interface.json is used.

        :param file_path: path to the json file containing ESNet Netbeam Host interface information.
        :return: Dictionary that maps IP => { resource : <value>, speed : <value> }.
        """
    if file_path is None:
        file_path = config.variables['sd_interface_file']
    if not path.exists(file_path):
        create_stardust_file(file_path)

    if time.time() - osstat(file_path).st_mtime > config.variables['interface_refresh_interval']:
        create_stardust_file(file_path)

    with open(file_path, 'r') as f:
        try:
            sd_cache = json.loads(f.read())
        except json.decoder.JSONDecodeError:
            create_stardust_file(file_path)
            sd_cache = json.loads(f.read())

    return sd_cache


def create_stardust_file(file_path=None):
    """
    Convert the result from ${netbeam}/api/network/esnet/prod/interfaces to a json file specified by filePath.

    This is used to find IP's from the traceroute that are monitored by Netbeam, which can then be polled for more
    information.

    :param file_path: Path to the file. By default this is interfaces.json.
    :return: None
    """
    if file_path is None:
        file_path = config.variables['sd_interface_file']

    with open(file_path, 'wt') as f:
        res = {}
        try:
            r = es.search(index='sd_public_interfaces',
                          body=
                          {'size': 0,
                           '_source': False,
                           'aggs': {
                               'interfaces': {
                                   'multi_terms': {
                                       'size': 25000,
                                       'terms': [
                                           {'field': 'meta.ipv4'},
                                           {'field': 'meta.id'},
                                           {'field': 'meta.speed'}
                                       ]
                                   }
                               }
                           },
                           'query': {
                               'bool': {
                                   'filter': [
                                       {'range': {'start': {'gte': 'now-15m/m', 'lte': 'now'}}}
                                   ]
                                   ,
                                   'must': [
                                       {'exists': {'field': 'meta.ipv4'}}
                                   ]
                               }
                           }})
            interfaces = r['aggregations']['interfaces']['buckets']

            for bucket in interfaces:
                iface = bucket['key']
                res[iface[0]] = {
                    'resource': iface[1],
                    'speed': iface[2]
                }
            # The speed we get corresponds to if-mib::ifHighSpeed, which returns the speed in units
            # of 1000000 bps so we need to multiply by this to get the correct value. This can be double checked by
            # comparing the values after processing to those found on my.es.net/network/interfaces
            for key in res.keys():
                if res.get(key)['speed'] is not None:
                    res.get(key)['speed'] = res.get(key)['speed'] * 1000000

            f.write(json.dumps(res))
        except elasticsearch.exceptions.ConnectionTimeout:
            print(f'Request for interfaces timed out')
            return None

    chmod(file_path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IWGRP)
