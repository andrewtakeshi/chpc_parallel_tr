import sys
import re
import json
import time
import subprocess
import requests
import urllib3
import threading
import socket

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
ip_validation_regex = re.compile(r'((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.)'
                                 r'{3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])')
my_ip = subprocess.run(['curl', 'ifconfig.me'],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                universal_newlines=True).stdout.splitlines()[0]
rdap_cache = dict()
lock = threading.Lock()
limiter = 0


def ip_to_asn(ip):
    if ip_validation_regex.match(ip):
        return requests.get(f'https://api.iptoasn.com/v1/as/ip/{ip}').json()
    else:
        return None


def rdap_org_lookup(ip):
    if ip not in rdap_cache:
        if ip_validation_regex.match(ip):
            print(f"Requesting Org of {ip}")
            response = requests.get(f'https://rdap.arin.net/registry/ip/{ip}')
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
                            rdap_cache[ip] = {"org" : ntt['handle'], "domain": "unknown"}
                            break
                    except:
                        pass
            else:
                print(f'Received response from unknown NCC; {response.url}')
                return {"org": "unknown", "domain": "unknown"}
        else:
            return {"org": "unknown", "domain": "unknown"}
    return rdap_cache[ip]


def check_pscheduler(endpoint):
    """
    Queries the endpoint to see if it is running pScheduler. Does this through the API provided by pScheduler.
    :param endpoint: Endpoint to be queried.
    :return: True if endpoint is running pScheduler, False otherwise.
    """
    if not endpoint.__contains__('https'):
        endpoint = 'https://' + endpoint
    response = requests.get(f'{endpoint}/pscheduler', verify=False).content.decode('utf8')
    return response.__contains__('pScheduler API server')


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


def pscheduler_to_d3(source, dest, numRuns = 1):
    """
    Tries to run a pScheduler traceroute from source to destination.
    The source must also be running pScheduler, as must the server/machine running this code.
    If the source is running pScheduler, a traceroute is scheduled, run, and the results converted into
    JSON ingestible by the d3 visualisation.
    :param source: Source for traceroute
    :param dest: Destination for traceroute.
    :param numRuns: Number of times to run the traceroute.
    :return: JSON ingestible by the d3 visualisation if the traceroute is successful. None otherwise.
    """

    # Check the source
    if not check_pscheduler(source):
        return None

    i = 0
    processList = []
    global limiter

    # Schedule traceroute using pscheduler (allows for remote sources)
    lock.acquire()
    if limiter >= 10 or (limiter + numRuns) > 15:
        print("Over the run limit. Please try again later.")
        return None
    else:
        limiter += numRuns
    lock.release()

    for _ in range(numRuns):
        processList.append(subprocess.Popen(['pscheduler', 'task', 'trace', '-s', source, '-d', dest],
                                            stdout=subprocess.PIPE, universal_newlines=True))

    for process in processList:
        process.wait()

    # Consider optimizing by making these calls async, i.e. call before setting up processList and do processing on
    # results after waiting for processes in processList. Would likely need to move outside of definitions to do so.
    # Currently it takes forever because we have to wait for multiple calls to pscheduler.
    source_ip = target_to_ip(source)
    if source_ip is None:
        print("Unable to resolve source to IP")
        return None
    # dest_ip = pscheduler_target_to_ip(source, dest)

    output = []
    ip = ''

    # Process every line in the traceroute.
    for process in processList:
        output.append(dict())
        output[i]['ts'] = int(time.time())
        output[i]['source_address'] = source_ip
        # output[i]['target_address'] = dest_ip
        output[i]['packets'] = []
        output[i]['packets'].append({
            'ttl': 0,
            'ip': source_ip,
            'rtt': 0
        })
        for line in process.communicate()[0].splitlines():
            # print(line)
            # Filter out for only lines that match the traceroute results.
            if re.match(r'^\s*[0-9]+\s+', line):
                split = line.split()
                # Common to all hops
                toAdd = {
                    "ttl": int(split[0])
                }
                # Server didn't respond. Only add the 'common' items.
                if split[1] == "No" or split[1] == "*":
                    output[i]['packets'].append(toAdd)
                # Server responded. Do some additional parsing.
                else:
                    # Extract IP address
                    ip = re.search(r'\(?([0-9]{1,3}\.){3}[0-9]{1,3}\)?', line)
                    ip = line[ip.regs[0][0]: ip.regs[0][1]]
                    ip = re.sub(r'\(|\)', '', ip)

                    # Extract RTT
                    rtt = re.findall(r'[0-9]+\.?[0-9]* ms', line)
                    rtt = float(re.sub(r'm|s|\s', '', rtt[0]))

                    toAdd['ip'] = ip
                    toAdd['rtt'] = rtt

                    output[i]['packets'].append(toAdd)
        # Gets target address from the last hop - this is much faster than running a separate
        # pScheduler ping, and effectively cuts the runtime in half.
        output[i]['target_address'] = ip
        i += 1
        process.stdout.close()
        process.kill()

    output = {'traceroutes': output}

    lock.acquire()
    limiter -= numRuns
    lock.release()

    return output


def system_to_d3(dest, numRuns = 1):
    """
    Runs a system traceroute (on linux systems) to the desired destination. RTT is calculated as the mean average of the
    three pings for each hop.
    :param dest: Destination for traceroute.
    :param numRuns: Number of runs to do.
    :return: JSON ingestible by the d3 visualisation if the traceroute is successful. None otherwise.
    """

    i = 0
    processList = []
    global limiter

    dest_ip = target_to_ip(dest)

    lock.acquire()
    if limiter >= 10 or (limiter + numRuns) > 15:
        print("Over the run limit. Please try again later.")
        return None
    else:
        limiter += numRuns
    lock.release()

    # Schedule traceroute using pscheduler (allows for remote sources)
    for _ in range(numRuns):
        processList.append(subprocess.Popen(['traceroute', dest], stdout=subprocess.PIPE, universal_newlines=True))

    for process in processList:
        process.wait()

    output = []

    for process in processList:
        output.append(dict())
        output[i]['ts'] = int(time.time())
        output[i]['source_address'] = my_ip
        output[i]['target_address'] = dest_ip
        output[i]['packets'] = []
        output[i]['packets'].append({
            'ttl': 0,
            'ip': my_ip,
            'rtt': 0
        })
        for line in process.communicate()[0].splitlines():
            if re.match(r'^\s*[0-9]+\s+', line):
                split = line.split()

                # Common to all items in the traceroute path.
                toAdd = {
                    "ttl": int(split[0])
                }
                # Hop didn't reply
                if re.match(r"No|\*", split[1]):
                    output[i]["packets"].append(toAdd)
                # Hop replied; additional information available
                else:
                    ip = ""
                    if re.match(r'([0-9]{1,3}\.){3}[0-9]{1,3}', split[1]):
                        ip = split[1]
                    else:
                        ip = re.sub(r"\(|\)", "", split[2])

                    rttArr = re.findall(r"[0-9]+\.?[0-9]* ms", line)
                    rtt = 0
                    for response in rttArr:
                        rtt += float(re.sub(r"[ms]", "", response))
                    rtt /= len(rttArr)

                    toAdd["ip"] = ip
                    toAdd["rtt"] = rtt.__round__(3)
                    output[i]["packets"].append(toAdd)
        i += 1
        process.stdout.close()
        process.kill()

    output = {'traceroutes': output}

    lock.acquire()
    limiter -= numRuns
    lock.release()

    return output


def esmond_to_d3(source=None, dest=None, ts_min=None, ts_max=None,
                 base_esmond_url="http://uofu-science-dmz-bandwidth.chpc.utah.edu"):
    # Check for source or destination.
    if source is None and dest is None:
        print("Source or destination must be specified.")
        return None

    # Get information from Esmond
    traceroutes = requests.get(
        f"{base_esmond_url}/esmond/perfsonar/archive/?format=json&tool-name=pscheduler/traceroute").json()

    # Change ts values if not specified. Changes min to 0 and max to current epoch time + 180 days.
    if ts_min is None:
        ts_min = 0
    if ts_max is None:
        ts_max = time.time() + (180 * 24 * 60 * 60)

    urls = []
    output = []

    # Get source/destination specific URLs from original Esmond query. Store as tuple of url, source ip, and dest. ip
    # in the urls array.
    for traceroute in traceroutes:
        if ((traceroute['destination'] == dest
             and (source is None
                  or traceroute['source'] == source))
                or (traceroute['source'] == source
                    and (dest is None
                         or traceroute['destination'] == dest))):
            for event in traceroute['event-types']:
                if event['event-type'] == 'packet-trace':
                    urls.append((event['base-uri'], traceroute['source'], traceroute['destination']))

    # No matching urls found = no source/destination/both matches the values given. Return None.
    if len(urls) == 0:
        print("Unable to find any matching traceroutes")
        return None

    # Access URLs relevant to source/dest
    for url in urls:
        r = requests.get(f'{base_esmond_url}/{url[0]}/?format=json')
        try:
            for trace in r.json():
                # Filter with ts info
                if ts_min <= trace['ts'] <= ts_max:
                    # Setup
                    toAdd = dict()
                    toAdd['ts'] = trace['ts']
                    toAdd['source_address'] = url[1]
                    toAdd['target_address'] = url[2]
                    toAdd['packets'] = []

                    # Add source to traceroute info.
                    toAdd['packets'].append({
                        'ttl': 0,
                        'ip': url[1],
                        'rtt': 0
                    })

                    # Get packet info from val array
                    for packet in trace['val']:
                        packetInfo = {
                            'ttl': packet['ttl']
                        }
                        if 'ip' in packet:
                            packetInfo['ip'] = packet['ip']
                            packetInfo['rtt'] = packet['rtt']
                        toAdd['packets'].append(packetInfo)
                    output.append(toAdd)
                # Skip traceroutes that fall outside of ts filter
                else:
                    continue
        except json.decoder.JSONDecodeError:
            print(f'JSON unavailable {url}')
            continue

    # Return output if captured. Return none otherwise.
    if len(output) != 0:
        return {'traceroutes': output}
    else:
        return None


# No limiting in place, and quite possibly buggy. Just updated to work with the new schema.
def system_copy_to_d3(dataIn):
    """
    Takes a previously run traceroute and creates the appropriate JSON.
    Does not include source information (as source information is not provided by system traceroute).
    Accepts both Linux and Windows traceroute formats.
    :param dataIn: Copied traceroute information.
    :return: JSON ingestible by the d3 visualisation.
    """
    output = []

    i = -1

    linux = True

    for line in dataIn.splitlines():
        # For processing multiple traceroutes (i.e. pasting multiple runs in at once)
        if line.__contains__("Tracing") or line.__contains__("traceroute"):
            i += 1
            output.append(dict())
            if not line.__contains__("traceroute"):
                linux = False

            output[i]["ts"] = int(time.time())
            output[i]["source_address"] = None
            output[i]["packets"] = []
        if re.match('^\s*[0-9]+\s+', line):
            split = line.split()
            ip = ''
            # Common to all items in the traceroute path.
            toAdd = {
                "ttl": int(split[0])
            }
            # Server didn't reply; same thing for both Linux and Windows
            if re.match("No|\*", split[1]):
                output[i]["packets"].append(toAdd)
                ip = ''

            # Server replied; additional information available
            else:
                # Linux traceroute format
                if linux:
                    if re.match('([0-9]{1,3}\.){3}[0-9]{1,3}', split[1]):
                        ip = split[1]
                    else:
                        ip = re.sub("\(|\)", "", split[2])

                    rttArr = re.findall("[0-9]+\.?[0-9]+ ms", line)
                    rtt = 0
                    for response in rttArr:
                        rtt += float(re.sub("[ms]", "", response))
                    rtt /= len(rttArr)

                    toAdd["ip"] = ip
                    toAdd["rtt"] = rtt.__round__(3)
                    output[i]["packets"].append(toAdd)

                # Windows traceroute format
                else:
                    # Case where hostname is found
                    if len(split) == 9:
                        ip = re.sub("\[|\]", "", split[8])
                    # Case where only IP is used
                    else:
                        ip = split[7]
                    toAdd["ip"] = ip

                    rttArr = re.findall("\<?[0-9]+ ms", line)
                    rtt = 0
                    for response in rttArr:
                        response = re.sub("ms|<", "", response)
                        rtt += float(response)
                    rtt /= len(rttArr)

                    toAdd["rtt"] = rtt.__round__(3)
                    output[i]["packets"].append(toAdd)
            output[i]["target_address"] = ip
    if len(output) != 0:
        return {'traceroutes': output}
    else:
        return None

# Testing pt.1
# input = ""
#
# for line in sys.stdin.readlines():
#     input += line
#
#
# print(system_copy_to_d3(input))

