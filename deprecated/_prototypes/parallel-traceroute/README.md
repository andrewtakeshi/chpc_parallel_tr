# parallel-traceroute

Author: Paul Fischer (U of Utah, CHPC)

## Notice

This is a rough, alpha-phase proof-of-concept and not meant for serious use. There are bugs. Extensive improvements are intended for the entire stack, including backend data sources and frontend GUI/viz.

If you have comments or questions, please contact me: p.fischer at utah.edu.

## Setup notes

Clone this repo. This will probably only run on a Linux distribution.

1. Requires a Neo4j server on localhost, default ports (7474, 7687).
    * See https://neo4j.com/developer/docker-run-neo4j/ for quick Docker setup)
    * If not using the default u:neo4j p:test credentials, change user/pass in both index.js (top of file) and index.html (search for 'server_user:')

2. To use paris-traceroute, make sure it has raw socket permissions as an unprivileged user
    * After building and installing paris-traceroute, run `sudo setcap cap_net_raw+eip /usr/local/bin/paris-traceroute` to allow normal users to use it.

3. To launch the tool, run `node index` from inside this directory.

4. Navigate to `localhost:3001` to use the tool.