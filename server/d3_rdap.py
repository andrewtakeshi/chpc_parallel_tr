"""
Author: Andrew Golightly
"""
import threading
import requests
from server import d3_conversion_utils

# Used for rdap_cache_*
# Stores previous rdap lookup results in a dictionary
rdap_cache = dict()
# Used to protect dictionary (cache) accesses across multiple threads
rdap_lock = threading.Lock()


def not_found(packet):
    """
    Helper method to modify packet in place. Sets org and domain to None. 
    :param packet: Packet to modify.
    """
    packet['org'] = None
    packet['domain'] = None


def rdap_cache_tw(packet, ip):
    """
    Thread specific work. Each thread looks up the RDAP data for a single packet - the IP is part of the packet but
    passed for convenience. Modifies the packet in place and adds domain and org information.
    :param packet: Packet to add RDAP info to.
    :param ip: IP address of the packet.
    """
    # Check for valid IP
    if not d3_conversion_utils.ip_validation_regex.match(ip):
        not_found(packet)
        return

    try:
        # Look up org and domain info from ARIN
        response = requests.get(f'https://rdap.arin.net/registry/ip/{ip}')
        if response.status_code != 200:
            not_found(packet)
            return
        # ARIN managed networks
        if response.url.__contains__('arin'):
            # These for loops cannot be combined; if they are it breaks because it changes the org to an incorrect value
            for ntt in response.json()['entities']:
                # Try to grab the org
                try:
                    rdap_lock.acquire()
                    rdap_cache[ip] = {'org': ntt['vcardArray'][1][1][3]}
                    rdap_lock.release()
                    break
                except:
                    rdap_lock.release()
                    pass
            for ntt in response.json()['entities']:
                # Try to grab the domain - primary location
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
                    # Try to grab domain - secondary location
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
                    # Lookup org - domain isn't given from RIPE networks.
                    if 'registrant' in ntt['roles']:
                        rdap_lock.acquire()
                        rdap_cache[ip] = {'org': ntt['handle'], 'domain': 'unknown'}
                        rdap_lock.release()
                        break
                except:
                    rdap_lock.release()
                    pass
        # Response from unknown NCC - there may be more, but I only ever got responses from RIPE and ARIN.
        else:
            not_found(packet)
            return
    # If connection fails, call not_found to allow for retries
    except requests.exceptions.ConnectionError:
        not_found(packet)
        return
    # As long as we get a valid response, we should be able to get the org
    packet['org'] = rdap_cache[ip]['org']
    # Domain isn't guaranteed, so we need to double check this value. 
    if 'domain' in rdap_cache[ip]:
        packet['domain'] = rdap_cache[ip]['domain']
    else:
        packet['domain'] = None
    return


def rdap_cache_threaded(d3_json):
    """
    Add org and domain information to d3_json.
    :param d3_json: JSON ingestible by d3. Modified in place.
    """
    threads = []

    for tr in d3_json['traceroutes']:
        for packet in tr['packets']:
            # If unknown packet, just set org and domain to None and continue. 
            if 'ip' not in packet:
                packet['org'] = None
                packet['domain'] = None
                continue
            ip = packet.get('ip')
            rdap_lock.acquire()
            if ip not in rdap_cache:
                rdap_lock.release()
                # Run each packet on its own thread
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


def rdap_tw(packet):
    """
    Thread work to add domain and org info to a single packet.
    :param packet: Packet to add information to.
    """
    if 'ip' not in packet:
        not_found(packet)
        return
    ip = packet.get('ip')
    if not d3_conversion_utils.ip_validation_regex.match(ip):
        not_found(packet)
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
        # TODO: Add lacnic NCC
        # Unknown managed networks. The list can be added to, but I only ran into RIPE and ARIN.
        else:
            print(f'Received response from unknown NCC; {response.url}')
            not_found(packet)
            return
    except requests.exceptions.ConnectionError:
        not_found(packet)
        return


def rdap_threaded(d3_json):
    """
    Threaded version of RDAP lookup WITHOUT using cache. Adds domain and org info.
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
