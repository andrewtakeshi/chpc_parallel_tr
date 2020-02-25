# TODO: TLS (requests.get)

import json
import re
import requests
import sys
import argparse
from datetime import datetime
import os
import logging

logging.basicConfig(level=logging.INFO)

outfile = ""
def main():
    parser = _setup_args()
    args = parser.parse_args()

    global outfile
    outfile = args.outfile

    esmond_traceroute_params = {
            "subject-type": "point-to-point",
            "pscheduler-test-type": "trace"
            }

    mintime = parse_timestamp(args.start_time) if args.start_time else None
    maxtime = parse_timestamp(args.end_time) if args.end_time else None

    # Create and process an Esmond API request
    if args.esmond:
        api_call = f"https://{args.esmond}/esmond/perfsonar/archive/?format=json"
        for k,v in esmond_traceroute_params.items():
            api_call += f"&{k}={v}"
        if args.measurement_id:
            api_call += f"&metadata-key={args.measurement_id}"
        if args.source:
            api_call += f"&source={args.source}"
        if args.dest:
            api_call += f"&destination={args.dest}"

        logging.info(f"Requesting perfSONAR measurements via {api_call}")
        r = requests.get(api_call, verify=False)
        if r.status_code != 200:
            logging.error(f"Returned HTTP error {r.status_code}")
        process_esmond_measurements(r.json(), mintime=mintime, maxtime=maxtime)
    else:
        logging.warning("No Esmond server specified, skipping remote data gathering via Esmond API ('--esmond <esmond_host>' to query Esmond API")

    # Try to process any data from the command line
    if args.infile:
        logging.info(f"Processing local data from the infile")
        try:
            local_data = json.load(args.infile)
            try:
                process_esmond_traceroutes(local_data, mintime=mintime, maxtime=maxtime)
            except KeyError:
                process_esmond_measurements(local_data, mintime=mintime, maxtime=maxtime)
        except json.JSONDecodeError as e:
            logging.error(f"Couldn't parse JSON data in the infile: {e.msg}")
        args.infile.close()
    else:
        logging.warning("No infile specified, skipping local data processing ('--infile -' to pipe from stdin)")

    outfile.close()


def _setup_args():
    argparser = argparse.ArgumentParser(
            formatter_class=argparse.RawDescriptionHelpFormatter,
            prog="python3 esmond-traceroute-to-cypher.py",
            description="Converts Esmond API traceroute data to Cypher queries for analysis/visualization in graph databases such as Neo4j.",
            epilog="""\
Examples:

    Pull data from an Esmond API request with some filters:
    $ python3 esmond-traceroute-to-cypher.py \\
            --esmond=uofu-science-dmz-bandwidth.chpc.utah.edu \\
            --source=uofu-science-dmz-bandwidth.chpc.utah.edu \\
            --start-time=2020-02-20

    Read directly from curl:
    $ curl <args> | python3 esmond-traceroute-to-cypher.py -i -

    Pipe directly into a Neo4j database via `cypher-shell`
    $ python3 esmond-traceroute-to-cypher <args> | cypher-shell -a bolt://<neo4j_host>:7687 -u <neo4j_user> -p <neo4j_pass>
                    """)
    argparser.add_argument("-e", "--esmond", help="Address of Esmond API server")
    argparser.add_argument("-s", "--source", help="Address of traceroute source")
    argparser.add_argument("-d", "--dest", help="Address of traceroute destination")
    argparser.add_argument("-t", "--start-time", help="Minimum timestamp of traceroutes to process")
    argparser.add_argument("-T", "--end-time", help="Maximum timestamp of traceroutes to process")
    argparser.add_argument("-m", "--measurement-id", help="Esmond ID (i.e. 'metadata-key') of a specific measurement to process")
    argparser.add_argument("-o", "--outfile", help="Write generated Cypher to this file [stdout]", type=argparse.FileType("a+"), default=sys.stdout)
    argparser.add_argument("-i", "--infile", nargs="?", help="Read Esmond API JSON from this file (- for stdin)", type=argparse.FileType("r"))
    return argparser


def process_esmond_measurements(data, mintime=None, maxtime=None):
    """
    Attempt to process any traceroute measurements found in the data.

    Example data via API:
        https://<esmond_server>/esmond/perfsonar/archive?format=json
    """
    logging.info(f"Found {len(data)} measurements, looking for valid traceroute measurements")
    for measurement in data:
        if "event-types" in measurement:
            try:
                r = requests.get(measurement["url"].split("?")[0] + "packet-trace/base?format=json", verify=False)
                logging.info(f"Processing traceroute measurement {measurement['url']}")
                process_esmond_traceroutes(r.json(), mintime=mintime, maxtime=maxtime, source_ip=measurement["source"])
            except BaseException as e:
                logging.error(f"Couldn't process measurement: {measurement['url']}. {e.__class__.__name__}: {e}")
        else:
            logging.error(f"Couldn't locate 'event-types' key in a measurement.")


def process_esmond_traceroutes(data, mintime=None, maxtime=None, source_ip=None):
    """
    Iterate over a list of Esmond API traceroutes and write them as Cypher queries to the outfile."
    """
    global outfile
    if mintime or maxtime:
        logging.info(f"Processing {len(data)} traceroutes (some may be skipped due to time filters)")
    else:
        logging.info(f"Processing {len(data)} traceroutes")
    for traceroute in data:
        if (mintime is None or traceroute["ts"] >= mintime) and (maxtime is None or traceroute["ts"] < maxtime):
            outfile.write(esmond_traceroute_to_cypher(traceroute["val"], source_ip=source_ip))
            outfile.flush()


def esmond_traceroute_to_cypher(data, source_ip=None):
    """
    Convert dict (JSON) traceroute data to a single Cypher query for loading into graph databases.
    """
    lasthop = None
    cypher = ""
    if source_ip:
        owner_guess = "N/A"
        try:
            owner_guess = data[0]["as"]["owner"]
        except:
            pass
        lasthop = {"ip": source_ip, "as": {"owner": owner_guess}, "rtt": 0.0, "ttl": 0}
        cypher = cypher_create_node(lasthop) + os.linesep
    intermediate_hops = 0
    for hop in data:
        node_cypher = cypher_create_node(hop)
        if node_cypher:
            cypher += node_cypher + os.linesep
            if lasthop:
                cypher += cypher_link_nodes(hop, lasthop, intermediate_hops) + os.linesep
            intermediate_hops = 0
            lasthop = hop
        else:
            intermediate_hops += 1
    return cypher + ";" + os.linesep


def generate_guid(hop, prefix="n"):
    """Generate a deterministic guid from traceroute hop data"""
    if "hostname" in hop:
        guid = re.sub("[.-]", "", f"{prefix}{hop['hostname']}{hop['ttl']}")
    elif "ip" in hop:
        guid = re.sub("[.-]", "", f"{prefix}{hop['ip']}{hop['ttl']}")
    else:
        return None
    return guid


def cypher_create_node(hop):
    varname = generate_guid(hop)
    orgname = "UNKNOWN"
    try:
        orgname = hop["as"]["owner"]
    except KeyError:
        pass
    if "hostname" in hop:
        return f"MERGE ({varname}:Server {{hostname: '{hop['hostname']}'}}) SET {varname}.ipv4addr='{hop['ip']}', {varname}.orgname='{orgname}', {varname}.visits=coalesce({varname}.visits+1, 1)"
    elif "ip" in hop:
        return f"MERGE ({varname}:Server {{ipv4addr: '{hop['ip']}'}}) SET {varname}.orgname='{orgname}', {varname}.visits=coalesce({varname}.visits+1, 1)"
    else:
        return False


def cypher_link_nodes(hop, prevhop, intermediate_hops):
    n1var = generate_guid(prevhop)
    n2var = generate_guid(hop)
    relvar = generate_guid(hop, 'ln')
    latency = max(0, hop['rtt'] - prevhop['rtt'])
    return f"MERGE ({n1var})-[{relvar}:LINK {{intermediate_hops:{intermediate_hops}}}]->({n2var}) SET {relvar}.avg_latency=coalesce(({relvar}.avg_latency+{latency}),{latency})"


def parse_timestamp(timespec):
    """Get a timestamp (seconds) from dates like 2020-02-20 or 2020-02-20T09:00:00.

    Valid formats:
        epoch timestamp (i.e. seconds since 1970, floats will be safely truncated)
        %Y-%m-%d
        %Y-%m-%dT%H:%M:%S
    """
    dt = None
    try:
        dt = datetime.fromtimestamp(int(timespec))
    except ValueError:
        try:
            dt = datetime.strptime(timespec, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            try:
                dt = datetime.strptime(timespec, "%Y-%m-%d")
            except ValueError:
                raise ValueError(f"Could not parse time '{timespec}'. Times must be in Unix timestamp (seconds), '%Y-%m-%d', or '%Y-%m-%dT%H:%M:%S' format.")
    return int(dt.timestamp())


if __name__ == "__main__":
    main()
