import sys
import re
import json
import time
import subprocess
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ip_validation_regex = re.compile(r'((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])')

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


def get_source_info(source):
    """
    Pings the source address to get an IP address.
    Returns JSON formatted to match that returned by *_to_d3 defs.
    :param source:
    :return:
    """
    ping_process = subprocess.run(['ping', '-c', '1', source], stdout=subprocess.PIPE, universal_newlines=True)
    line = ping_process.stdout.splitlines()[0]
    re_res = re.search(r'([0-9]{1,3}\.){3}[0-9]{1,3}', line)
    ip = line[re_res.regs[0][0]:re_res.regs[0][1]]
    return {
        "success": 1,
        "query": 1,
        "ttl": 0,
        "ip": ip,
        "rtt": 0
    }


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

    # Schedule traceroute using pscheduler (allows for remote sources)
    for _ in range(numRuns):
        processList.append(subprocess.Popen(['pscheduler', 'task', 'trace', '-s', source, '-d', dest],
                                            stdout=subprocess.PIPE, universal_newlines=True))

    for process in processList:
        process.wait()

    source_info = get_source_info(source)

    output = []

    # Process every line in the traceroute.
    for process in processList:
        output.append(dict())
        output[i]['ts'] = int(time.time())
        output[i]['val'] = []
        output[i]['val'].append(source_info)
        for line in process.communicate()[0].splitlines():
            # print(line)
            # Filter out for only lines that match the traceroute results.
            if re.match(r'^\s*[0-9]+\s+', line):
                split = line.split()
                # Common to all hops
                toAdd = {
                    "success": 1,
                    "query": 1,
                    "ttl": int(split[0])
                }
                # Server didn't respond. Only add the 'common' items.
                if split[1] == "No" or split[1] == "*":
                    output[i]['val'].append(toAdd)
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

                    output[i]['val'].append(toAdd)
        i += 1
        process.stdout.close()
        process.kill()

    # Convert to an actual JSON (takes care of some formatting).
    output = json.dumps(output)

    # sys.stdout.write(output)
    # print(output)

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

    source_process = subprocess.run(['curl', 'ifconfig.me'],
                                    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                    universal_newlines=True).stdout.splitlines()[0]

    # Schedule traceroute using pscheduler (allows for remote sources)
    for _ in range(numRuns):
        processList.append(subprocess.Popen(['traceroute', dest], stdout=subprocess.PIPE, universal_newlines=True))

    for process in processList:
        process.wait()

    output = []

    for process in processList:
        output.append(dict())
        output[i]['ts'] = int(time.time())
        output[i]['val'] = []
        for line in process.communicate()[0].splitlines():
            if re.match(r'^\s*[0-9]+\s+', line):
                split = line.split()

                # Common to all items in the traceroute path.
                toAdd = {
                    "success": 1,
                    "query": 1,
                    "ttl": int(split[0])
                }
                # Hop didn't reply
                if re.match(r"No|\*", split[1]):
                    output[i]["val"].append(toAdd)
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
                    output[i]["val"].append(toAdd)
        i += 1
        process.stdout.close()
        process.kill()

    output = json.dumps(output)
    sys.stdout.write(output)


def system_copy_to_d3(dataIn):
    """
    Takes a previously run traceroute and creates the appropriate JSON.
    Does not include source information (as source information is not provided by system traceroute).
    Accepts both Linux and Windows traceroute formats.
    The files tracert_examples/tracert_{linux, windows} were used as stdin to test this module.
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
            output[i]["val"] = []
        if re.match('^\s*[0-9]+\s+', line):
            split = line.split()

            # Common to all items in the traceroute path.
            toAdd = {
                "success": 1,
                "query": 1,
                "ttl": int(split[0])
            }
            # Server didn't reply; same thing for both Linux and Windows
            if re.match("No|\*", split[1]):
                output[i]["val"].append(toAdd)

            # Server replied; additional information available
            else:
                # Linux traceroute format
                if linux:
                    ip = ""
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
                    output[i]["val"].append(toAdd)

                # Windows traceroute format
                else:
                    # Case where hostname is found
                    if len(split) == 9:
                        toAdd["ip"] = re.sub("\[|\]", "", split[8])
                    # Case where only IP is used
                    else:
                        toAdd["ip"] = split[7]

                    rttArr = re.findall("\<?[0-9]+ ms", line)
                    rtt = 0
                    for response in rttArr:
                        response = re.sub("ms|<", "", response)
                        rtt += float(response)
                    rtt /= len(rttArr)

                    toAdd["rtt"] = rtt.__round__(3)
                    output[i]["val"].append(toAdd)

    output = json.dumps(output)
    return output

# Testing
# input = ""
# for line in sys.stdin.readlines():
#     input += line
# print(system_copy_to_d3(input))
# print(system_to_d3('ccts-mon.chpc.utah.edu', 3))
# print(pscheduler_to_d3('dtn01-dmz.chpc.utah.edu', 'ccts-mon.chpc.utah.edu', 10))