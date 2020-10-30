import subprocess
import random
import uuid

from icmplib import traceroute
import time
import threading


def run_traceroute(dest, returnArray, id):
    hops = traceroute(dest, count=1, id=id)
    returnArray.append(hops)


def main():
    threads = []
    returnArray = []
    limit = 50

    for i in range(limit):
        random.seed(a=i)
        threads.append(threading.Thread(target=run_traceroute, args=('8.8.8.8', returnArray, random.randrange(100000))))
        threads[i].start()

    for i in range(limit):
        threads[i].join()

    for hop in returnArray:
        print(hop)


main()
