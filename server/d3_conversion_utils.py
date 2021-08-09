import requests
# import urllib3
from requests.packages.urllib3.exceptions import InsecureRequestWarning
import subprocess
import re
import socket

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

ip_validation_regex = re.compile(r'^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.)'
                                 r'{3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])$')
my_ip = subprocess.run(['curl', 'ifconfig.me'],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                       universal_newlines=True).stdout.splitlines()[0]
rdap_cache = dict()


def ip_to_asn(ip):
    if ip_validation_regex.match(ip):
        return requests.get(f'https://api.iptoasn.com/v1/as/ip/{ip}', timeout=6).json()
    else:
        return None


# TODO: REMOVE THIS AND REPLACE WITH WHOIS LOOKUP
def rdap_org_lookup(ip):
    not_found = {"org": None, "domain": None}

    if ip not in rdap_cache:
        if ip_validation_regex.match(ip):
            print(f"Requesting Org of {ip}")
            try:
                response = requests.get(f'https://rdap.arin.net/registry/ip/{ip}')
                if response.status_code != 200:
                    return not_found
                # ARIN managed networks
                if response.url.__contains__('arin'):
                    print('Received response from ARIN')
                    for ntt in response.json()['entities']:
                        try:
                            rdap_cache[ip] = {"org": ntt['vcardArray'][1][1][3]}
                            break
                        except:
                            pass
                    for ntt in response.json()['entities']:
                        try:
                            rdap_cache[ip]["domain"] = ntt['vcardArray'][1][5][3].split('@')[-1]
                            print(rdap_cache[ip])
                            break
                        except:
                            pass
                    if "domain" not in rdap_cache[ip]:
                        for ntt in response.json()['entities'][0]['entities']:
                            try:
                                rdap_cache[ip]["domain"] = ntt['vcardArray'][1][5][3].split('@')[-1]
                                break
                            except:
                                pass
                # RIPE managed networks
                elif response.url.__contains__('ripe'):
                    print('Received response from RIPE')
                    for ntt in response.json()['entities']:
                        try:
                            if 'registrant' in ntt['roles']:
                                rdap_cache[ip] = {"org": ntt['handle'], "domain": "unknown"}
                                break
                        except:
                            pass
                else:
                    print(f'Received response from unknown NCC; {response.url}')
                    return not_found
            except requests.exceptions.ConnectionError:
                return not_found
        else:
            return not_found
    return rdap_cache[ip]

def check_pscheduler(endpoint):
    """
    Queries the endpoint to see if it is running pScheduler. Does this through the API provided by pScheduler.
    :param endpoint: Endpoint to be queried.
    :return: True if endpoint is running pScheduler, False otherwise.
    """
    if not endpoint.__contains__('https'):
        endpoint = 'https://' + endpoint
    try:
        response = requests.get(f'{endpoint}/pscheduler', verify=False, timeout=6).content.decode('utf8')
        return response.__contains__('pScheduler API server')
    except:
        pass
    return False


def target_to_ip(target):
    """
    Gets the IP address of target.
    :param target: Hostname (or IP address)
    :return: IP address associated with target.
    """
    try:
        return socket.gethostbyname(target)
    except:
        return None
