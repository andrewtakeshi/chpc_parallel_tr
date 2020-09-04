const width = 600;
const height = 600;

let entities = ({"traceroutes": []});

let netbeamTableHelper = (ip, label, hops, speed) => {
    if (!document.getElementById(`table_${ip}_${label}`))
    {
        let collapse_body = document.getElementById(`collapse_body_${ip}`);
        collapse_body.innerHTML += `<table class="table table-bordered" id="table_${ip}_${label}">
                                        <thead>
                                            <tr>
                                                <th colspan="4" style="text-align: center">${label}</th>
                                            </tr>
                                            <tr>
                                                <th>TS</th>
                                                <th>IN</th>
                                                <th>OUT</th>
                                                <th>SPEED</th>
                                            </tr>
                                        </thead>
                                        <tbody id="table_body_${ip}_${label}"></tbody>
                                        </table>`;
    }

    let tbody = document.getElementById(`table_body_${ip}_${label}`);

    hops.forEach(hop => {
        let row = tbody.insertRow();
        for (let i = 0; i < 4; i++) {
            row.insertCell(i);
        }
        row.cells[0].innerHTML = hop[0];
        row.cells[1].innerHTML = hop[1];
        row.cells[2].innerHTML = hop[2];
        row.cells[3].innerHTML = speed;
    })
}

const netbeamTable = async (traceroutes) => {
    let accordion_div = document.getElementById('netbeam_accordion');
    document.getElementById('netbeam_table_area').style.visibility = "visible";
    traceroutes.forEach(traceroute => {
        traceroute.packets.forEach(packet => {
            let ip = packet.ip;
            let speed = packet.speed;
            if ("traffic" in packet) {
                // Set up card for each individual IP address. Done in traffic because
                // it's the first table generated.
                if (!document.getElementById(`collapse_${ip}`)) {
                    accordion_div.innerHTML +=
                        `<div class="card">
                            <div class="card-header">
                                <a class="collapsed card-link" data-toggle="collapse" href="[id='collapse_${ip}']">
                                    ${ip}
                                </a>
                            </div>
                            <div id="collapse_${ip}" class="collapse" data-parent="#netbeam_accordion">
                                <div class="card-body" id="collapse_body_${ip}"></div>
                            </div>
                        </div>`;
                }
                netbeamTableHelper(ip, 'Traffic', packet.traffic, speed);
            }
            if ("unicast_packets" in packet) {
                netbeamTableHelper(ip, "Unicast_packets", packet.unicast_packets, speed);
            }
            if ("discards" in packet) {
                netbeamTableHelper(ip, "Discards", packet.discards, speed);
            }
            if ("errors" in packet) {
                netbeamTableHelper(ip, "Errors", packet.errors, speed);
            }
        })
    });
}

const btndemo = async (source, dest, uuid) => {
    console.log(source, dest);
    const result = await runTraceroute(source, dest);
    console.log(result);
    document.getElementById(`${uuid}_status`).innerHTML = "Finished";
    await netbeamTable(result.traceroutes);
    entities.traceroutes = entities.traceroutes.concat(result.traceroutes);
    let graph = await createInternetGraph(entities.traceroutes);
    let org_graph = clusterBy(graph,
        (entity) => entity.org,
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "Org");
    return org_graph;
}

const demo = async (dest1, dest2) => {
    // const result1 = await d3.json(`http://habanero.chpc.utah.edu:5000/api/v1/resources/traceroutes?dest=${dest1}`);
    // const result2 = await d3.json(`http://habanero.chpc.utah.edu:5000/api/v1/resources/traceroutes?dest=${dest2}`);
    const result1 = await d3.json(`http://localhost:5000/api/v1/resources/traceroutes?dest=${dest1}`);
    const result2 = await d3.json(`http://localhost:5000/api/v1/resources/traceroutes?dest=${dest2}`);
    let graph1 = await createInternetGraph(result1.traceroutes);
    let graph2 = await createInternetGraph(result2.traceroutes);
    let graph = mergeInternetGraphs(graph1, graph2);
    let org_graph = clusterBy(graph,
        (entity) => entity.org,
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "Org");
    return org_graph;
}

async function loadData() {
    const metadata = await d3.json("data/esmond_examples/metadata.json");
    const packets = await d3.json("data/esmond_examples/packets.json");
    return ({metadata: metadata, traces: packets});
}


//d3.svg("resources/Utah_Utes_-_U_logo.svg").then((xml) => {
//    console.log(xml);
//    let xmlDoc = d3.select(xml.documentElement);
//    let v = d3.select("#d3_vis").node().appendChild(xml.documentElement);
//    console.log(xmlDoc);
//}); 


const viz = new Vizualization("#d3_vis");
//demo("8.8.8.8", "9.9.9.9").then(data => {viz.setData(data)});
