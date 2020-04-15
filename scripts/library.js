// build requirejs, d3js?
//d3 = require('d3');

// how to just "run" a js file?
// just run it as part of index.html and use the browser tools

const getEsmondTraceroute = (esmond_server, esmond_key) => {
  return d3.json(`http://${esmond_server}/esmond/perfsonar/archive/${esmond_key}/?format=json`).then(metadata => {
    const [url_base, url_parameters] = metadata["url"].split("?");
    return d3.json(url_base + "packet-trace/base" + "?" + url_parameters).then( traces => {
      return ({metadata: metadata, traces: traces});
    });
  });
};

const inferNetworkGraph = (traces) => {
  const nodes = Array();
  
  for (var trace of traces) {
    const packets = trace.val;
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      packet.ts = trace.ts;
      let node = nodes.find( n => n.ip == packet.ip );  // var?
      
      if (!node) {
        node = ({ip: packet.ip,
                 packets: new Array(),
                 source_ips: new Set(),
                 target_ips: new Set()
                });
        nodes.push(node);
      }
      
      node.packets.push(packet);
      if (i > 0)
        node.source_ips.add(packets[i-1].ip);
      if (i < packets.length-1)
        node.target_ips.add(packets[i+1].ip);
    }
  }
  
  return nodes;
};

const mapIPtoAS = (traces) => {
  const map = new Map();
  
  traces.forEach(trace => trace.forEach(packet => {
    if (packet.ip)
      map.set(packet.ip, packet.as ? packet.as.owner : "UNKNOWN")
    else
      map.set(packet.ip, "ANONYMOUS");
  }));
  
  return map;
}

// clusterBy takes a map of entities with an "id" property and returns a map of new entities that reference the input entities as children. Clustering is breadth-first driven by the given label equality, degree, and relationship parameters.
clusterBy = (entities, getLabel, getRelationships, max_degree = 1) => {
  const result = new Map();
  
  // Helper method for cleanliness
  result.addToCluster = (cluster_id, entity) => {
    if (!this.has(cluster_id)) {
        result.set(cluster_id, ({id: cluster_id, children: new Map()}));
    }
    result.get(cluster_id).children.set(entity.id, entity);
  }
  
  // If max_degree is 0, basically return the input
  if (max_degree == 0) {
    for (var [id,entity] of entities) {
      result.addToCluster(id, entity);
    }
  }
  // If max_degree is Infinity, basically do a "groupBy"
  else if (max_degree == Infinity) {
    for (var [id,entity] of entities) {
      result.addToCluster(getLabel(entity), entity);
    }
  }
  // Otherwise, exhaustive search (depth-first) for connected clusters of degree `max_degree`
  else {
    const orphan_ids = Array.from(entities.keys());
    

    
  }
  
  return result;
};