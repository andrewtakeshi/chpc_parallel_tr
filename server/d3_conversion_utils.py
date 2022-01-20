"""
Author: Andrew Golightly
"""
import requests
from requests.packages.urllib3.exceptions import InsecureRequestWarning
import subprocess
import re
import socket
import time

# Disables warnings for insecure requests using requests package
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

# Checks for valid IP
ip_validation_regex = re.compile(r'^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[1-9])\.)'
                                 r'((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.){2}'
                                 r'(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])$')

# Cached value of my_ip().
_my_ip_cached = None
_my_ip_cached_time = None


def my_ip():
    """
    Obtains the IP address of the server. It used to just be a lookup for the public IP, but this didn't make sense in
    context of the visualization as we had the public IP going to a private IP address (i.e. router or gateway).
    In devices where the public IP address is used, we still get this value. This is more complicated than the previous
    method, but it's more robust and works (as far as I've tested it) in all cases.
    :return: String representative of the IP address for the local machine.
    """
    global _my_ip_cached
    global _my_ip_cached_time
    # Refresh cached value if it hasn't been set before OR if it's been a day since last cached.
    if _my_ip_cached is None or _my_ip_cached_time < time.time() - 86400:
        # Find default interface
        default_interface = subprocess.run(['awk', '$2 == 00000000 { print $1 }', '/proc/net/route'],
                                           stdout=subprocess.PIPE, encoding='utf8').stdout.splitlines()[0]
        # Get IP information for the default interface.
        ip_addr_out = subprocess.run(['ip', 'addr', 'show', 'dev', default_interface], encoding='utf8',
                                     stdout=subprocess.PIPE)
        # Filter to get only the IP address.
        my_ip_test = subprocess.run(['awk', '$1 == \"inet\"' '{ sub("/.*", "", $2); print $2 }'], input=ip_addr_out.stdout,
                                    stdout=subprocess.PIPE, encoding='utf8').stdout.splitlines()[0]
        if len(my_ip_test) > 0:
            _my_ip_cached = my_ip_test
            _my_ip_cached_time = time.time()
    return _my_ip_cached


def ip_to_asn(ip):
    """
    Looks up ASN from IP address.
    :param ip: IP address to lookup.
    :return: ASN as JSON/dictionary.
    """
    if ip_validation_regex.match(ip):
        return requests.get(f'https://api.iptoasn.com/v1/as/ip/{ip}', timeout=6).json()
    else:
        return None


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
        ip = socket.gethostbyname(target)
        if ip_validation_regex.match(ip):
            return ip
        else:
            return None
    except:
        return None
