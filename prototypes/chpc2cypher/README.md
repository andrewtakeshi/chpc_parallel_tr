# chpc2cypher

Scripts for translating CHPC data into Cypher graphs.

1. Spin up a Neo4j instance if not already available
```
sudo docker run
    --name testneo4j
    -p7474:7474
    -p7687:7687
    -d
    -v $HOME/neo4j/data:/data
    -v $HOME/neo4j/logs:/logs
    -v $HOME/neo4j/import:/var/lib/neo4j/import
    -v $HOME/neo4j/plugins:/plugins
    --env NEO4J_AUTH=neo4j/test
    neo4j:latest
```

2. Log into `http://localhost:7474` with user "neo4j" and password "test"

3. Familiarize yourself with Neo4j and Cypher with the built-in tutorials, or

4. Load some data, possible from command line (with `cypher-shell`)

    * `traceroute google.com | awk -f traceroute-to-cypher.awk | cypher-shell -u neo4j -p test`

