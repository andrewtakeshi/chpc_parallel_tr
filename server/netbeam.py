import json
import requests
import time
import re
from os import path

url = "http://netbeam.es.net"


def createIP2ResourceDict(filePath=None):
    if filePath is None:
        f = open("interfaces.json", "wt")
    else:
        f = open(filePath, "wt")

    res = {}

    try:
        r = requests.get(f"{url}/api/network/esnet/prod/interfaces", timeout=5)

        if r.status_code == 200:
            for item in r.json():
                if item['ipv4'] is not None:
                    res[item['ipv4']] = \
                        {
                            'resource': item['resource'],
                            'speed': item['speed']
                        }

        for key in res.keys():
            if res.get(key)['speed'] is not None:
                res.get(key)['speed'] = res.get(key)['speed'] * 1000000

        f.write(json.dumps(res))
        return
    except requests.exceptions.Timeout:
        return


def timeInterval(interval="15m", startPoint=time.time()):
    """
    Takes a time interval and returns the unix time values (in ms) corresponding to the edges of the time interval.
    Time intervals follow the standard format, i.e. a number followed by a single character signifying a unit of
    measurement.
    Units of measurements include s (seconds), m (minutes), h (hours), d (days), and w (weeks).
    Other units (months, years, decades, etc.) could be added but I'm not sure if they're supported by the API,
    and for the use case it seems unreasonably long.
    :param interval: Relative time interval. Defaults to 15 minutes (15m).
    :param startPoint: Starting? point for the relative time interval. Defaults to the current time. Without any
    parameters, the function will return the current time and the time corresponding to 15 minutes before the current
    time.
    :return: Returns a tuple. The first value corresponds to the beginning time (i.e. 15 minutes before current time)
    and the second value corresponds to the ending time (i.e. current time).
    If an invalid time period is specified, it returns none.
    """

    end = startPoint * 1000
    split = re.split('([a-zA-Z])', interval)
    mult = 0

    if split[1] == 's':
        mult = 1
    elif split[1] == 'm':
        mult = 60
    elif split[1] == 'h':
        mult = 60 ** 2
    elif split[1] == 'd':
        mult = 60 ** 2 * 24
    elif split[1] == 'w':
        mult = 60 ** 2 * 24 * 7
    else:
        print("Unsupported time period.")
        return None

    if mult != 0:
        end = time.time() * 1000
        begin = end - (int(split[0]) * mult * 1000)
        return begin, end


def getInterfaces(filterRes=False, filePath=None):
    """
    Gets all interfaces. Optionally filters "good" interfaces, which are interfaces for which a link speed is defined.
    :param filterRes: Optional, defaults to false. When set to true, only interfaces with a defined link speed will be
    written to file.
    :param filePath: Optional, defaults to current directory. Specifies the location to write the results to.
    :return: Writes the resource name and link speed as a CSV. Writes to file specified in path (will wipe the file),
    or writes to interfaceList.csv in the current directory if no path is specified.
    """

    if filePath is None:
        f = open("interfaceList.csv", "wt")
    else:
        f = open(filePath, "wt")

    f.write("Resource, Speed\n")

    r = requests.get(f"{url}/api/network/esnet/prod/interfaces")

    if r.status_code == 200:
        for item in r.json():
            if filterRes and item['speed'] is not None:
                f.write(f"{item['resource']}, {item['speed']}\n")
            elif not filterRes:
                f.write(f"{item['resource']}, {item['speed']}\n")


def getSAPS(filePath=None):
    """
    Get list of SAPS.
    :param filePath: Optional. Specifies place to store the results. By default it writes to sapsList.csv in the current
    directory.
    :return: Writes the SAP resource name to a file.
    """
    if filePath is None:
        f = open("sapsList.csv", "wt")
    else:
        f = open(filePath, "wt")

    f.write("Resource\n")

    r = requests.get(f"{url}/api/network/esnet/prod/saps")

    if r.status_code == 200:
        for item in r.json():
            f.write(f"{item['resource']}\n")


def printTrafficData(inJson, units=True):
    """
    Prints out data collected by getTrafficByTimeRange.
    :param inJson: Request json passed in (r = requests.get(...), printTrafficData(r.json))
    :param units: Tells whether to print with units or not (currently only traffic gets units).
    :return: Void.
    """
    first = True
    div = 0
    unit = ""

    for k, v in inJson.items():
        if k == 'points':
            for trip in v:
                # Set up the units properly.
                if first and units:
                    first = False
                    if trip[1] > 1000 ** 3:
                        div = 1000 ** 3
                        unit = "Gbps"
                    elif trip[1] > 1000 ** 2:
                        div = 1000 ** 2
                        unit = "Mbps"
                    else:
                        div = 1000
                        unit = "Kbps"

                print("\tTime:", time.asctime(time.localtime(int(trip[0]) / 1000)))

                if units:
                    print("\t\tIn:", (0 if trip[1] is None else int(trip[1])) / div, unit)
                    print("\t\tOut:", (0 if trip[2] is None else int(trip[2])) / div, unit)
                else:
                    print("\t\tIn:", (0 if trip[1] is None else int(trip[1])))
                    print("\t\tOut:", (0 if trip[2] is None else int(trip[2])))


def getTrafficByTimeRange(resource: str = "devices/wash-cr5/interfaces/to_wash-bert1_ip-a", interval: str = "15m"):
    """
    Gets an interfaces traffic in a certain time range.
    :param resource: Only has a default value for testing purposes. This should be changed.
    Resource is specified in the format given by the API, i.e. devices/{host}/interfaces/{interface}.
    Resources can be gathered by looking at the file created by calling getInterfaces(True). Interfaces without a link
    speed aren't queryable (at least in my experience thus far), and calling getInterfaces(True) doesn't record the
    interfaces without reported link speeds.
    This will also work for SAPs. Resource for SAPs is devices/{host}/saps/{sap}.
    SAP resources can be gathered by looking at the file created by calling getSAPS(True). Same thing applies to SAPs as
    resources.
    :param interval: Defaults to 15m. See timeInterval definition for acceptable time range formats.
    :return: Void. Prints values for the specified time interval in 30s increments.
    """

    # Request traffic, unicast packets, # discards, # errors through the API.
    requestTypes = ["traffic", "unicast_packets", "discards", "errors"]
    units = [True, False, False, False]
    properNames = ["Traffic", "Unicast Packets", "Discards", "Errors"]

    # API endpoint is nearly identical for all the different things; only differs @ requestType.
    requestStr = lambda requestType: f"{url}/api/network/esnet/prod/{resource}/{requestType}?begin={begin}&end={end}"

    begin, end = timeInterval(interval=interval)

    res = {}

    # rInfo = something like [traffic, True, Traffic]
    for rInfo in zip(requestTypes, units, properNames):
        try:
            r = requests.get(requestStr(rInfo[0]), timeout=5)

            if r.status_code == 200 and len(r.content) != 0:
                res[rInfo[0]] = r.json()
            else:
                return None
        except requests.exceptions.Timeout:
            print(f'{resource} timed out')
            return None

    return res


def getTrafficByTimeRangeFlask(resource: str = "devices/wash-cr5/interfaces/to_wash-bert1_ip-a", interval: str = "15m"):
    """
    Gets an interfaces traffic in a certain time range.
    :param resource: Only has a default value for testing purposes. This should be changed.
    Resource is specified in the format given by the API, i.e. devices/{host}/interfaces/{interface}.
    Resources can be gathered by looking at the file created by calling getInterfaces(True). Interfaces without a link
    speed aren't queryable (at least in my experience thus far), and calling getInterfaces(True) doesn't record the
    interfaces without reported link speeds.
    This will also work for SAPs. Resource for SAPs is devices/{host}/saps/{sap}.
    SAP resources can be gathered by looking at the file created by calling getSAPS(True). Same thing applies to SAPs as
    resources.
    :param interval: Defaults to 15m. See timeInterval definition for acceptable time range formats.
    :return: Void. Prints values for the specified time interval in 30s increments.
    """

    # Request traffic, unicast packets, # discards, # errors through the API.
    requestTypes = ["traffic", "unicast_packets", "discards", "errors"]
    units = [True, False, False, False]
    properNames = ["Traffic", "Unicast Packets", "Discards", "Errors"]

    # API endpoint is nearly identical for all the different things; only differs @ requestType.
    requestStr = lambda requestType: f"{url}/api/network/esnet/prod/{resource}/{requestType}?begin={begin}&end={end}"

    begin, end = timeInterval(interval=interval)

    r1 = requests.get(requestStr(requestTypes[0]))
    r2 = requests.get(requestStr(requestTypes[1]))
    r3 = requests.get(requestStr(requestTypes[2]))
    r4 = requests.get(requestStr(requestTypes[3]))

    if r1.status_code == r2.status_code == r3.status_code == r4.status_code == 200:
        return {properNames[0]: r1.json(), properNames[1]: r2.json(),
                properNames[2]: r3.json(), properNames[3]: r4.json()}
    else:
        return {'error': 'error'}


def getTrafficByTimeRangeMultiple(resource: list, interval: str = "15m"):
    """
    Calls getTrafficByTimeRange on all the resources in the list passed in.
    :param resource: List of strings corresponding to resources, same format as in getTrafficByTimeRange.
    :param interval: Time range interval. Same format as getTrafficByTimeRange.
    :return: Void.
    """
    for r in resource:
        getTrafficByTimeRange(resource=r, interval=interval)


# Not useful anymore. I was going to do the scaling for units/divisor in getInterfaceTrafficByTimeRange here,
# but it's easier/better to do it in there.
def getInterfaceInformation(resource, filePath="interfaceList.csv"):
    # Get interfaces and store in file if the file doesn't exist.
    if not path.exists(filePath):
        getInterfaces(filePath=filePath)

    f = open(filePath, "rt")

    for line in f:
        split = line.strip().split(",")
        if split[0] == resource:
            return split[0], split[1]
