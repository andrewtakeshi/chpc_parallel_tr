const getEsmondTraceroute = (esmond_server, esmond_key) => {
  return d3.json(`http://${esmond_server}/esmond/perfsonar/archive/${esmond_key}/?format=json`).then(metadata => {
    const [url_base, url_parameters] = metadata["url"].split("?");
    return d3.json(url_base + "packet-trace/base" + "?" + url_parameters).then( traces => {
      return ({metadata: metadata, traces: traces});
    });
  });
};

const inferNetworkGraph = (traces) => {
  const entities = new Map();

  for (var trace of traces) {
    const packets = trace.val;
    for (let i = 0; i < packets.length; i++) {
      if (packets[i].ip == undefined)
        packets[i].ip = "unknown";
    }
    for (let i = 0; i < packets.length; i++) {
      const packet = packets[i];
      packet.ts = trace.ts;
      const entity_id = `ip(${packet.ip})`;
      let entity = entities.get(entity_id);
      
      if (!entity) {
        entity = ({id: entity_id,
                 ip: packet.ip,
                 packets: new Array(),
                 source_ids: new Set(),
                 target_ids: new Set()
                });
        entities.set(entity_id, entity);
      }
      
      entity.packets.push(packet);
      if (i > 0)
        entity.source_ids.add(`ip(${packets[i-1].ip})`);
      if (i < packets.length-1)
        entity.target_ids.add(`ip(${packets[i+1].ip})`);
    }
  }
  
  return entities;
};

const registryFromEsmondTraceroute = (traces) => {
  const map = new Map();
  for (let trace of traces) {
    for (let packet of trace.val) {
      if (packet.ip == undefined)
        map.set("unknown", "ANONYMOUS");
      else
        map.set(packet.ip, packet.as ? packet.as.owner : "UNKNOWN");
    }
  }
  
  return map;
}

// clusterBy takes a map of entities with an "id" property and returns a map of new entities that reference the input entities as children. Clustering is breadth-first driven by the given label equality, degree, and relationship parameters.
const clusterBy = (entities, getLabel, getRelationships, id_prefix = undefined, max_degree = 1) => {
  const result = new Map();
  
  // Helper method for cleanliness
  const addToCluster = (cluster_id, entity) => {
    if (!result.has(cluster_id)) {
      // Use ES6 Proxy to recursively access properties of hierarchical clusters (see `handler` def)
        result.set(cluster_id, new Proxy(({id: cluster_id, children: new Map()}), handler));
    }
    result.get(cluster_id).children.set(entity.id, entity);
  }
  
  // If max_degree is 0, basically return the input
  if (max_degree == 0) {
    for (var [id,entity] of entities) {
      addToCluster(id, entity);
    }
  }
  // If max_degree is Infinity, basically do a "groupBy"
  else if (max_degree == Infinity) {
    for (var [id,entity] of entities) {
      addToCluster(getLabel(entity), entity);
    }
  }
  // Otherwise, exhaustive search (depth-first) for connected clusters of degree `max_degree`
  else {
    const orphan_ids = Array.from(entities.keys());
    const cluster_count = new Map();

    let i = 0;
    while (i < orphan_ids.length) {
      // Start a new cluster from an unclustered entity
      const orphan = entities.get(orphan_ids[i]);
      const label = getLabel(orphan);

      // Disjoint clusters of the same label are enumerated for distinctness
      if (!cluster_count.has(label))
        cluster_count.set(label, 0);
      cluster_count.set(label, cluster_count.get(label) + 1);
      let cluster_id = id_prefix ? `${id_prefix}(${label})` : label;
      cluster_id += ` cluster-${cluster_count.get(label)}`;

      let candidates = [orphan_ids[i]];
      const visited = new Set();

      while (candidates.length > 0) {
        const candidate_id = candidates.pop();
        const candidate = entities.get(candidate_id);

        if (!visited.has(candidate_id)) {
          visited.add(candidate_id); // Don't check this candidate again for this cluster
          if (getLabel(candidate) == label) {
            // Found a match
            addToCluster(cluster_id, candidate);
            const neighbors = Array.from(getRelationships(candidate));
            candidates = candidates.concat(neighbors); // Add neighbors as new search candidates
            //TODO add support for max_degree > 1 (recursive neighbors), probably change candidates to a Set a the same time
            orphan_ids.splice(orphan_ids.indexOf(candidate_id), 1); // This entity now belongs to a cluster
          } 
        }
      }
    }
  }
  return result;
};

const propReducer = (property) => {
    let f = null;
    switch (property) {
      case "source_ids":
      case "target_ids":
        f = (a, b) => new Set([...a, ...b]);
        break;
      case "packets":
        f = (a, b) => a.concat(b);
        break;
      default:
        f = (a, b) => a == b ? a : undefined;
    }
    return f;
}

// If property is not present and the object has an array of child nodes, return an appropriate reduction
// of that property across all children
const handler = ({ 
  get: (obj, property) => property in obj 
                         ? obj[property]
                         : (obj.children ? Array.from(obj.children.values())
                                            .map( child => child[property])
                                            .reduce( (acc, value) => propReducer(property)(acc, value) ) 
                                         : undefined )
})


// d3.
//    min
//    max
//    mean
//    variance
//    deviation
//    quantile
