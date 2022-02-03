"""
Author: Andrew Golightly
"""
import random
import re
import json
import time
import subprocess
import requests
import threading
from icmplib import traceroute
from server import d3_conversion_utils, d3_geo_ip, d3_rdap, config, d3_stardust #d3_netbeam

# TODO: Add locks to everything, and variabalize the max and min limit values.
# lock + limiter are used to limit the number of concurrent traceroutes running
# The lock is a mutex on limiter; before traceroutes are queued/run the limiter is checked to see if there's enough
# "space" to do so.
lock = threading.Lock()
limiter = 0


def pscheduler_to_d3(source, dest, num_runs=1):
    """
    Tries to run a pScheduler traceroute from source to destination.
    The source must also be running pScheduler, as must the server/machine running this code.
    If the source is running pScheduler, a traceroute is scheduled, run, and the results converted into
    JSON ingestible by the d3 visualisation.
    :param source: Source for traceroute
    :param dest: Destination for traceroute.
    :param num_runs: Number of times to run the traceroute.
    :return: JSON ingestible by the d3 visualisation if the traceroute is successful. None otherwise.
    """

    i = 0
    process_list = []
    global limiter

    # Schedule traceroute using pscheduler (allows for remote sources)
    lock.acquire()
    if (limiter + num_runs) > config.variables['concurrent_run_limit']:
        lock.release()
        return {'error': 'over run limit'}
    else:
        limiter += num_runs
        lock.release()

    for _ in range(num_runs):
        process_list.append(subprocess.Popen(['pscheduler', 'task', 'trace', '-s', source, '-d', dest],
                                             stdout=subprocess.PIPE, universal_newlines=True))

    for process in process_list:
        process.wait()

    # Consider optimizing by making these calls async, i.e. call before setting up process_list and do processing on
    # results after waiting for processes in process_list. Would likely need to move outside of definitions to do so.
    # Currently it takes forever because we have to wait for multiple calls to pscheduler.
    source_ip = d3_conversion_utils.target_to_ip(source)
    if source_ip is None:
        print("Unable to resolve source to IP")
        return None

    output = []
    ip = ''

    # Process every line in the traceroute.
    for process in process_list:
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
            # Filter out for only lines that match the traceroute results.
            if re.match(r'^\s*[0-9]+\s+', line):
                split = line.split()
                # Common to all hops
                to_add = {
                    "ttl": int(split[0])
                }
                # Server didn't respond. Only add the 'common' items.
                if split[1] == "No" or split[1] == "*":
                    output[i]['packets'].append(to_add)
                # Server responded. Do some additional parsing.
                else:
                    # Extract IP address
                    ip = re.search(r'\(?([0-9]{1,3}\.){3}[0-9]{1,3}\)?', line)
                    ip = line[ip.regs[0][0]: ip.regs[0][1]]
                    ip = re.sub(r'[()]', '', ip)

                    # Extract RTT
                    rtt = re.findall(r'[0-9]+\.?[0-9]* ms', line)
                    rtt = float(re.sub(r'm|s|\s', '', rtt[0]))

                    to_add['ip'] = ip
                    to_add['rtt'] = rtt

                    output[i]['packets'].append(to_add)
        # Gets target address from the last hop - this is much faster than running a separate
        # pScheduler ping, and effectively cuts the runtime in half.
        output[i]['target_address'] = ip
        i += 1
        process.stdout.close()
        process.kill()

    output = {'traceroutes': output}

    lock.acquire()
    limiter -= num_runs
    lock.release()

    return add_additional_information(output)


def system_to_d3_icmplib_tw(dest, return_array, tr_id):
    """
    Thread work for system_to_d3_icmplib_threaded. Each thread runs one traceroute.
    :param dest: Traceroute destination.
    :param return_array: Array to write results in.
    :param tr_id: Traceroute takes an ID to prevent contamination between different threads.
    """
    dest_ip = d3_conversion_utils.target_to_ip(dest)
    if dest_ip is None:
        return {'error': 'Cannot resolve destination'}
    hops = traceroute(address=dest, count=1, id=tr_id)
    my_ip = d3_conversion_utils.my_ip()
    # Add object for single traceroute
    res = {
        'ts': int(time.time()),
        'source_address': my_ip,
        'target_address': dest_ip,
        'packets': []
    }
    # Add packet for source
    res['packets'].append({
        'ttl': 0,
        'ip': my_ip,
        'rtt': 0
    })
    # Add traceroute packets
    for hop in hops:
        res['packets'].append(
            {
                'ttl': hop.distance,
                'ip': hop.address,
                'rtt': hop.avg_rtt
            })
    # Add results to return_array
    return_array.append(res)


def system_to_d3_icmplib_threaded(dest, num_runs=1):
    """
    Multithreaded system traceroute run using icmplib. Works, but it ALWAYS takes the same path which defeats one of the
    main purposes of the tool, which is to visualize localized network paths (i.e. load balancing).
    :param dest: Traceroute destination
    :param num_runs: Number of runs
    :return: JSON ingestible by d3 visualization.
    """
    threads = []
    return_array = []

    # Use threads if > 1 run; otherwise, just run the traceroute.
    if num_runs > 1:
        for i in range(num_runs):
            threads.append(
                threading.Thread(target=system_to_d3_icmplib_tw, args=(dest, return_array, random.randrange(1000000),)))
            threads[i].start()

        for i in range(num_runs):
            threads[i].join()
    else:
        system_to_d3_icmplib_tw(dest, return_array, random.randrange(1000000))

    output = {'traceroutes': return_array}
    return add_additional_information(output)


def esmond_to_d3(source=None, dest=None, ts_min=None, ts_max=None,
                 esmond_server="http://uofu-science-dmz-bandwidth.chpc.utah.edu"):
    """
    Looks up historic traceroute data from Esmond and formats it for d3.
    :param source: Traceroute source
    :param dest: Traceroute destination
    :param ts_min: Time period to start search
    :param ts_max: Time period to end search
    :param esmond_server: Base address of Esmond server
    :return: JSON ingestible by d3.
    """
    # Check for source or destination.
    if source is None and dest is None:
        print("Source or destination must be specified.")
        return None

    # Get information from Esmond - this is all traceroutes run on this server stored in the Esmond DB.
    traceroutes = requests.get(
        f"{esmond_server}/esmond/perfsonar/archive/?format=json&tool-name=pscheduler/traceroute", timeout=10).json()

    # Change ts values if not specified. Changes min to 0 and max to current epoch time + 180 days.
    # This means it searches all the traceroute data.
    if ts_min is None:
        ts_min = 0
    if ts_max is None:
        ts_max = time.time() + (180 * 24 * 60 * 60)

    urls = []
    output = []

    # Get source/destination specific URLs from original Esmond query. Store as tuple of url, source ip, and dest. ip
    # in the urls array.
    for tr in traceroutes:
        if ((tr['destination'] == dest
             and (source is None
                  or tr['source'] == source))
                or (tr['source'] == source
                    and (dest is None
                         or tr['destination'] == dest))):
            for event in tr['event-types']:
                if event['event-type'] == 'packet-trace':
                    urls.append((event['base-uri'], tr['source'], tr['destination']))

    # No matching urls found = no source/destination/both matches the values given. Return None.
    if len(urls) == 0:
        print("Unable to find any matching traceroutes")
        return None

    # Access URLs relevant to source/dest
    for url in urls:
        r = requests.get(f'{esmond_server}/{url[0]}/?format=json', timeout=10)
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
        return add_additional_information(output)
    else:
        return None


def system_copy_to_d3(tr_in):
    """
    Takes a previously run traceroute and creates the appropriate JSON.
    Does not include source information (as source information is not provided by system traceroute).
    Accepts both Linux and Windows traceroute formats.
    No limiting in place, and quite possibly buggy. Just updated to work with the new schema.
    :param tr_in: Copied traceroute information.
    :return: JSON ingestible by the d3 visualisation.
    """
    output = []

    i = -1

    linux = True

    for line in tr_in.splitlines():
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
                        ip = re.sub("[()]", "", split[2])

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
                        ip = re.sub("[\[\]]", "", split[8])
                    # Case where only IP is used
                    else:
                        ip = split[7]
                    toAdd["ip"] = ip

                    rttArr = re.findall("<?[0-9]+ ms", line)
                    rtt = 0
                    for response in rttArr:
                        response = re.sub("ms|<", "", response)
                        rtt += float(response)
                    rtt /= len(rttArr)

                    toAdd["rtt"] = rtt.__round__(3)
                    output[i]["packets"].append(toAdd)
            output[i]["target_address"] = ip
    if len(output) != 0:
        return add_additional_information(output)
    else:
        return None


def system_to_d3_tw(dest, return_array):
    """
    Thread specific work for system_to_d3_threaded. Each thread runs a single traceroute.
    :param dest: Traceroute destination
    :param return_array: Array to write results into
    """
    # Run traceroute as subprocess - only do 1 time/hop to reduce time required.
    sp_stdout = subprocess.run(['traceroute', dest, '-q', '1'], stdout=subprocess.PIPE, universal_newlines=True).stdout

    my_ip = d3_conversion_utils.my_ip()

    res = {
        'ts': int(time.time()),
        'source_address': my_ip,
        'target_address': dest,
        'packets': []
    }

    res['packets'].append({
        'ttl': 0,
        'ip': my_ip,
        'rtt': 0
    })

    for line in sp_stdout.splitlines():
        # Ignore lines that don't contain traceroute info.
        if re.match(r'^\s*[0-9]+\s+', line):
            split = line.split()

            # Common to all items in the traceroute path.
            toAdd = {
                "ttl": int(split[0])
            }
            # Hop didn't reply
            if re.match(r"No|\*", split[1]):
                res['packets'].append(toAdd)
            # Hop replied; additional information available
            else:
                ip = ""
                if re.match(r'([0-9]{1,3}\.){3}[0-9]{1,3}', split[1]):
                    ip = split[1]
                else:
                    ip = re.sub(r"[()]", "", split[2])

                rttArr = re.findall(r"[0-9]+\.?[0-9]* ms", line)
                rtt = 0
                for response in rttArr:
                    rtt += float(re.sub(r"[ms]", "", response))
                rtt /= len(rttArr)

                toAdd["ip"] = ip
                toAdd["rtt"] = rtt.__round__(3)
                res['packets'].append(toAdd)
    return_array.append(res)


def system_to_d3_threaded(dest, num_runs=1):
    """
    Runs a system traceroute to the desired destination - threaded.
    :param dest: Traceroute destination.
    :param num_runs: Number of runs.
    :return: JSON ingestible by d3.
    """
    threads = []
    returnArray = []

    dest_ip = d3_conversion_utils.target_to_ip(dest)
    if dest_ip is None:
        return {'error': 'Cannot resolve destination'}

    if num_runs > 1:
        for i in range(num_runs):
            threads.append(threading.Thread(target=system_to_d3_tw, args=(dest_ip, returnArray,)))
            threads[i].start()
        for i in range(num_runs):
            threads[i].join()
    else:
        system_to_d3_tw(dest_ip, returnArray)

    output = {'traceroutes': returnArray}
    return add_additional_information(output)


def system_to_d3(dest, num_runs=1):
    """
    Runs a system traceroute to the desired destination. Single threaded, but uses multiple subprocesses so it may
    actually be multithreaded under the hood, so to speak.
    :param dest: Traceroute destination.
    :param num_runs: Number of runs.
    :return: JSON ingestible by the d3.
    """

    i = 0
    processList = []
    global limiter

    dest_ip = d3_conversion_utils.target_to_ip(dest)

    if dest_ip is None:
        return {'error': 'Cannot resolve destination'}

    # Check to make sure we can run the traceroute according to limiter.
    lock.acquire()

    if (limiter + num_runs) > config.variables['concurrent_run_limit']:
        lock.release()
        return {'error': 'over run limit'}
        # print("Over the run limit. Please try again later.")
        # return None
    else:
        limiter += num_runs
        lock.release()

    # Run each traceroute as a subprocess - Popen runs it in the background.
    for _ in range(num_runs):
        processList.append(subprocess.Popen(['traceroute', dest], stdout=subprocess.PIPE, universal_newlines=True))

    # Wait for each subprocess to finish.
    for process in processList:
        process.wait()

    output = []

    my_ip = d3_conversion_utils.my_ip()

    # Process output of each traceroute.
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
                        ip = re.sub(r"[()]", "", split[2])

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

    # Decrement limiter after we have finished running the traceroutes.
    lock.acquire()
    limiter -= num_runs
    lock.release()

    return add_additional_information(output)


def remove_unknowns(d3_json):
    """
    Removes unknown hops from d3 JSON.
    :param d3_json: JSON formatted for d3. Modified in place, so no return.
    """
    for tr in d3_json['traceroutes']:
        i = 0
        while i < len(tr['packets']):
            packet = tr['packets'][i]
            if 'ip' not in packet:
                tr['packets'].remove(packet)
            else:
                i += 1


def add_additional_information(d3_json):
    """
    Run all functions which add additional information, i.e. Netbeam and geoIP pieces.
    :param d3_json: JSON formatted for d3 to add additional information to (i.e. output from system_to_d3_*). All
    functions called here should modify the JSON in place and should not return anything.
    :return: Modified version of d3_json.
    """
    # TODO: Compare cost of parallel => sequential to parallel => parallel and (current) sequential => parallel.
    remove_unknowns(d3_json)
    d3_stardust.add_sd_info_threaded(d3_json)
    d3_geo_ip.add_geo_info_threaded(d3_json)
    d3_rdap.rdap_threaded(d3_json)
    # d3_netbeam.add_netbeam_info_threaded(d3_json)
    # d3_json = d3_rdap.rdap_cache_threaded(d3_json)
    # d3_json = d3_geo_ip.add_geo_info_naive(d3_json)
    # d3_json = d3_netbeam.add_netbeam_info_db_naive(d3_json)
    return d3_json
