#!/usr/bin/bash
neo4j_dir="$HOME/virt/neo4j"
sudo docker run --name testneo4j -p7474:7474 -p7687:7687 -d -v $neo4j_dir/data:/data -v $neo4j_dir/logs:/logs -v $neo4j_dir/import:/var/lib/neo4j/import -v $neo4j_dir/plugins:/plugins --env NEO4J_AUTH=neo4j/test neo4j:latest

