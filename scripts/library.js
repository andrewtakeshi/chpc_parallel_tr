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

const createChart = (data) => {
    const ips = inferNetworkGraph(data.traces);
    const registry_AS = registryFromEsmondTraceroute(data.traces);
    const clusters = clusterBy(ips, 
        (entity) => registry_AS.get(entity.ip),
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "AS");
    const all_nodes = new Map([...ips, ...clusters]);

    const node_id_alias = new Map();

    for (var [k,v] of clusters) {
        v.expanded = false;
        node_id_alias.set(k, k);
        for (var [kk,vv] of v.children) {
            vv.expanded = false;
            node_id_alias.set(kk, k);
        }
    }

    const collapse = (node) => {
        const _collapse = (child) => {
            child.expanded = false;
            node_id_alias.set(child.id, node.id)
            if (child.children) {
                for (var [id, child] of node.children) {
                    _collapse(child);
                }
            }
        };
        _collapse(node);
    }

    const expand = (node) => {
        node.expanded = true;
        if (node.children) {
                for (var [id, child] of node.children) {
                    collapse(child);
                }
        }
    }

    const nodeColor = d => {
        const scale = d3.scaleOrdinal(d3.schemeCategory10);
        return d => scale(registry_AS.get(d.ip));
    }

    const nodeRadius = d => {
        const scale = d3.scaleLog().domain([1, d3.max(clusters.values(), d => clusters.packets.length)]).range([5,12]);
    }

    chart = d3.select("#d3_vis").append("svg")
        .attr("width", width)
        .attr("height", height)
        .style('transform', 'translate(100%, 0)')
        .attr("align", "center");
    
    // Tooltips
    tooltip = d3.select("#d3_vis").append("div")
        .attr("id", "tooltip")
        .attr("style", "position: absolute; opacity: 0;");

    grafana_chart = tooltip.append("iframe")
        .attr("width", 450)
        .attr("height", 200);

    traceroute_stats = tooltip.append("div");

    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id())  // change to current_alias
        .force("charge", d3.forceManyBody())
        .force("center", d3.forceCenter(width / 2, height / 2));

    const drag = simulation => {
        function dragstarted(d) {
            if (!d3.event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(d) {
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }
        
        function dragended(d) {
            if (!d3.event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    };

    chart.append("svg:defs").selectAll("marker")
        .data(["end"])      // Different link/path types can be defined here
        .enter().append("svg:marker")    // This section adds in the arrows
        .attr("id", String)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 23)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("svg:path")
        .attr("d", "M0,-5L10,0L0,5");

    let link = chart.append("g")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .attr("marker-end", "url(#end)")
        .selectAll("line");

    let node = chart.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle");

    const update = () => {
        var nodes = Array.from(clusters.values());
        var links = new Array();
        let i = 0;
        while (i < nodes.length) {
            if (nodes[i].expanded && nodes[i].children) {
                nodes = nodes.concat(Array.from(nodes[i].children.values()));
                nodes.splice(i, 1);
            }
            else {
                i += 1;
            }
        }

        // TODO keep old nodes in place
        //if (node.data()[0] != undefined) {
        //    const old = new Map(node.data().map(d => [d.id, d]));
        //    nodes = nodes.map(d => Object.assign(old.get(d.id) || {}, d));
        //}
        nodes.forEach(d => {
            let target_aliases =  new Set();
            if (d.target_ids) {
                d.target_ids.forEach(t => {
                    target_aliases.add(node_id_alias.get(t));
                })
                target_aliases.forEach(t => {
                    if (d.id != t)
                        links.push(({source: d, target: all_nodes.get(t)}));
                })
            }
        });
        node = node
          .data(nodes, d => d.id)
          .join(enter => enter.append("circle")
                //.attr("r", d => nodeRadius(d))
                .attr("r", d => d.children ? 8 : 5)
                //.attr("fill", d => nodeColor(d))
                .attr("fill", d => d.children ? "green" : "red")
                .on("dblclick", d => {
                    d3.event.preventDefault();
                    expand(d);
                    update();
                    })
                .on("mouseover", d => {
                    d3.select("#tooltip").transition().duration(200).style('opacity', 0.9);//.text(`${d.id}\n\n  packets: ${d.packets.length}`);
                    let packets = d.packets;
                    traceroute_stats.text(`${d.id} | ${packets.length} packets | RTT (mean): ${d3.mean(packets, p => p.rtt)}`);
                    if (d.ip) {
                        grafana_chart.style("display", "block");
                        grafana_chart.attr("src", `https://snapp-portal.grnoc.iu.edu/grafana/d-solo/f_KR9xeZk/ip-address-lookup?orgId=2&from=1588478400000&to=1588564799000&var-ip_addr=${d.ip}&panelId=2`);
                    } else {
                        grafana_chart.style("display", "none");
                    }
                })
                .on("mouseout", () => {
                    //d3.select("#tooltip").transition().duration(200).style('opacity', 0)
                })
                .on('mousemove', () => {
                    d3.select('#tooltip').style('left', (d3.event.pageX+10) + 'px').style('top', (d3.event.pageY+10) + 'px')
                })
                .call(drag(simulation)));

        link = link
            .data(links)
            .join("line");

        simulation.nodes(nodes);
        simulation.force("link", d3.forceLink(links).id(d => d.id));
        //simulation.force("link").links(links);
        simulation.alpha(1).restart();
    };

    update();


    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
        });
}