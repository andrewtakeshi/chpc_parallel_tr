import d3_conversion
from icmplib import traceroute
import subprocess
import threading
import random
import time
import sys
import getopt

my_ip = subprocess.run(['curl', 'ifconfig.me'],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                       universal_newlines=True).stdout.splitlines()[0]


def system_to_d3_tw(dest, returnArray, tr_id):
    dest_ip = d3_conversion.target_to_ip(dest)
    hops = traceroute(address=dest, count=1, id=tr_id)
    res = {
        'ts': int(time.time()),
        'source_address': my_ip,
        'target_address': dest_ip,
        'packets': []
    }
    res['packets'].append({
        'ttl': 0,
        'ip': my_ip,
        'rtt': 0
    })
    for hop in hops:
        res['packets'].append(
            {
                'ttl': hop.distance,
                'ip': hop.address,
                'rtt': hop.avg_rtt
            })
    returnArray.append(res)


def run_traceroute(argv): #dest, numRuns=1):
    dest = ''
    numRuns = 1

    if len(argv) == 2:
        dest = argv[0]
        numRuns = int(argv[1])
    elif len(argv) == 1:
        dest = argv[0]
    else:
        print('icmplibSystemTR dest [numRuns]')
        exit(-1)

    print(dest)
    print(numRuns)

    threads = []
    returnArray = []

    # print(f'Running traceroute to {dest} from source')

    if numRuns > 1:
        for i in range(numRuns):
            threads.append(
                threading.Thread(target=system_to_d3_tw, args=(dest, returnArray, random.randrange(1000000),)))
            threads[i].start()

        for i in range(numRuns):
            threads[i].join()
    else:
        system_to_d3_tw(dest, returnArray, random.randrange(1000000))

    output = {'traceroutes': returnArray}
    return d3_conversion.add_netbeam_info_threaded(output)

if __name__ == '__main__':
    print(sys.argv)
    print(run_traceroute(sys.argv[1:]))



