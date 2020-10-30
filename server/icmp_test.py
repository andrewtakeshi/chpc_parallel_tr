import subprocess
import random
import requests
from icmplib import traceroute
from server import netbeam
import time
import threading

resource_array = ["devices/bnl-lsw5/interfaces/irb.2"]#["devices/bnl-lsw1/interfaces/vlan.2", "devices/bnl-lsw5/interfaces/irb.2", "devices/bois-cr1/interfaces/xe-7%2F3%2F0.911"]

def run_traceroute(dest, returnArray, id):
    hops = traceroute(dest, count=1, id=id)
    returnArray.append(hops)

def netbeam_info(returnArray, resource):
    print(f'Getting {resource}')
    res = netbeam.getTrafficByTimeRange(resource)
    if res is not None:
        returnArray.append(res)





def main():
    threads = []
    returnArray = []

    st = time.time()
    i = 0
    for item in resource_array:
        threads.append(threading.Thread(target=netbeam_info, args=(returnArray, item,)))
        threads[i].start()
        i += 1

    for j in range(i):
        threads[j].join()
    print(returnArray)
    print(time.time() - st)

    returnArray = []
    st = time.time()
    for item in resource_array:
        res = netbeam.getTrafficByTimeRange(item)
        returnArray.append(res)

    print(returnArray)
    print(time.time() - st)

    # limit = 50
    #
    # for i in range(limit):
    #     random.seed(a=i)
    #     threads.append(threading.Thread(target=run_traceroute, args=('8.8.8.8', returnArray, random.randrange(100000))))
    #     threads[i].start()
    #
    # for i in range(limit):
    #     threads[i].join()
    #
    # for hop in returnArray:
    #     print(hop)


main()
