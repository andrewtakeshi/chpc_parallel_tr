import re
import threading
import requests
from server import d3_conversion_utils

rdap_cache = dict()
ip_validation_regex = re.compile(r'^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.)'
                                 r'{3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])$')
rdap_lock = threading.Lock()


def rdap_cache_tw(packet, ip):
    def not_found():
        packet['org'] = None
        packet['domain'] = None

    if not ip_validation_regex.match(ip):
        not_found()
        return

    try:
        response = requests.get(f'https://rdap.arin.net/registry/ip/{ip}')
        if response.status_code != 200:
            not_found()
            return
        # ARIN managed networks
        if response.url.__contains__('arin'):
            for ntt in response.json()['entities']:
                try:
                    rdap_lock.acquire()
                    rdap_cache[ip] = {'org': ntt['vcardArray'][1][1][3]}
                    rdap_lock.release()
                    break
                except:
                    rdap_lock.release()
                    pass
            for ntt in response.json()['entities']:
                try:
                    rdap_lock.acquire()
                    rdap_cache[ip]['domain'] = ntt['vcardArray'][1][5][3].split('@')[-1]
                    rdap_lock.release()
                    break
                except:
                    rdap_lock.release()
                    break
            if 'domain' not in rdap_cache[ip]:
                for ntt in response.json()['entities'][0]['entities']:
                    try:
                        rdap_lock.acquire()
                        rdap_cache[ip]['domain'] = ntt['vcardArray'][1][5][3].split('@')[-1]
                        rdap_lock.release()
                        break
                    except:
                        rdap_lock.release()
                        pass
        # RIPE managed networks
        elif response.url.__contains__('ripe'):
            for ntt in response.json()['entities']:
                try:
                    if 'registrant' in ntt['roles']:
                        rdap_lock.acquire()
                        rdap_cache[ip] = {'org': ntt['handle'], 'domain': 'unknown'}
                        rdap_lock.release()
                        break
                except:
                    rdap_lock.release()
                    pass
        else:
            not_found()
            return
    except requests.exceptions.ConnectionError:
        not_found()
        return
    packet['org'] = rdap_cache[ip]['org']
    if 'domain' in rdap_cache[ip]:
        packet['domain'] = rdap_cache[ip]['domain']
    else:
        packet['domain'] = None
    return


def rdap_cache_threaded(d3_json):
    threads = []

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            if 'ip' not in packet:
                packet['org'] = None
                packet['domain'] = None
                continue
            ip = packet.get('ip')
            rdap_lock.acquire()
            if ip not in rdap_cache:
                rdap_lock.release()
                thread = threading.Thread(target=rdap_cache_tw, args=(packet, packet.get('ip'),))
                threads.append(thread)
                thread.start()
            else:
                rdap_lock.release()
                packet['org'] = rdap_cache[ip]['org']
                if 'domain' in rdap_cache[ip]:
                    packet['domain'] = rdap_cache[ip]['domain']
                else:
                    packet['domain'] = None

    for thread in threads:
        thread.join()

    return d3_json


def rdap_tw(packet):
    """
    Thread work to add domain and org info to a single packet.
    :param packet: Packet to add information to.
    """
    def not_found():
        packet['org'] = None
        packet['domain'] = None

    if 'ip' not in packet:
        not_found()
        return
    ip = packet.get('ip')
    if not ip_validation_regex.match(ip):
        not_found()
        return
    
    try:
        response = requests.get(f'https://rdap.arin.net/registry/ip/{ip}')
        if response.status_code != 200:
            return not_found
        # ARIN managed networks
        if response.url.__contains__('arin'):
            print('Received response from ARIN')
            # These for loops can't be combined - doing so breaks it.
            for ntt in response.json()['entities']:
                try:
                    packet['org'] = ntt['vcardArray'][1][1][3]
                    break
                except:
                    pass
            for ntt in response.json()['entities']:
                try:
                    packet['domain'] = ntt['vcardArray'][1][5][3].split('@')[-1]
                    break
                except:
                    pass
            # Check secondary location if domain not found.
            if 'domain' not in packet:
                for ntt in response.json()['entities'][0]['entities']:
                    try:
                        packet['domain'] = ntt['vcardArray'][1][5][3].split('@')[-1]
                        break
                    except:
                        pass
            return
        # RIPE managed networks
        elif response.url.__contains__('ripe'):
            print('Received response from RIPE')
            for ntt in response.json()['entities']:
                try:
                    if 'registrant' in ntt['roles']:
                        # No consistent way to find domain in RIPE managed networks, so we skip over it.
                        packet['org'] = ntt['handle']
                        packet['domain'] = None
                        break
                except:
                    pass
            return
        # Unknown managed networks. The list can be added to, but I only ran into RIPE and ARIN.
        else:
            print(f'Received response from unknown NCC; {response.url}')
            not_found()
            return
    except requests.exceptions.ConnectionError:
        not_found()
        return
    


def rdap_threaded(d3_json):
    """
    Threaded version of RDAP lookup without using cache. Adds domain and org info.
    :param d3_json: JSON ingestible by d3. Modified in place.
    """
    threads = []
    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            thread = threading.Thread(target=rdap_tw, args=(packet,))
            threads.append(thread)
            thread.start()
    for thread in threads:
        thread.join()
