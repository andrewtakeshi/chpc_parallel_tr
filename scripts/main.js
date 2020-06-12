const width = 600;
const height = 600;

async function loadData() {
    const metadata = await d3.json("data/esmond_examples/metadata.json");
    const packets = await d3.json("data/esmond_examples/packets.json");
    return ({metadata: metadata, traces: packets});
}

loadData().then((result) => {
    const ips = inferNetworkGraph(result.traces);
    const registry_AS = registryFromEsmondTraceroute(result.traces);
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
})

// Get some basic visuals up (static graph viz method for entities)