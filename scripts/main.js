const width = 600;
const height = 600;

let entities = ({"traceroutes": []});

const netbeam_table = async (traceroutes) => {
    document.getElementById('netbeam_table_area').style.visibility = "visible";
    let tbody = document.getElementById('netbeam_table').getElementsByTagName('tbody')[0];
    traceroutes.forEach(traceroute => {
        traceroute.packets.forEach(packet => {
            let ip = packet.ip;
            let speed = packet.speed;
            if ("traffic" in packet) {
                packet.traffic.forEach(hop => {
                    let row = tbody.insertRow();
                    for (let i = 0; i < 6; i++) {
                        row.insertCell(i);
                    }
                    row.cells[0].innerHTML = ip;
                    row.cells[1].innerHTML = "traffic";
                    row.cells[2].innerHTML = hop[0];
                    row.cells[3].innerHTML = hop[1];
                    row.cells[4].innerHTML = hop[2];
                    row.cells[5].innerHTML = speed;
                })
            }
            if ("unicast_packets" in packet) {
                packet.unicast_packets.forEach(hop => {
                    let row = tbody.insertRow();
                    row.style.backgroundColor = "#f2f2f2";
                    for (let i = 0; i < 6; i++) {
                        row.insertCell(i);
                    }
                    row.cells[0].innerHTML = ip;
                    row.cells[1].innerHTML = "unicast_packets";
                    row.cells[2].innerHTML = hop[0];
                    row.cells[3].innerHTML = hop[1];
                    row.cells[4].innerHTML = hop[2];
                    row.cells[5].innerHTML = speed;
                })
            }
            if ("discards" in packet) {
                packet.discards.forEach(hop => {
                    let row = tbody.insertRow();
                    for (let i = 0; i < 6; i++) {
                        row.insertCell(i);
                    }
                    row.cells[0].innerHTML = ip;
                    row.cells[1].innerHTML = "discards";
                    row.cells[2].innerHTML = hop[0];
                    row.cells[3].innerHTML = hop[1];
                    row.cells[4].innerHTML = hop[2];
                    row.cells[5].innerHTML = speed;
                })
            }
            if ("errors" in packet) {
                packet.errors.forEach(hop => {
                    let row = tbody.insertRow();
                    row.style.backgroundColor = "#f2f2f2";
                    for (let i = 0; i < 6; i++) { row.insertCell(i); }
                    row.cells[0].innerHTML = ip;
                    row.cells[1].innerHTML = "errors";
                    row.cells[2].innerHTML = hop[0];
                    row.cells[3].innerHTML = hop[1];
                    row.cells[4].innerHTML = hop[2];
                    row.cells[5].innerHTML = speed;
                })
            }
        })
    });
}

const btndemo = async (source, dest, uuid) => {
    console.log(source, dest);
    const result = await runTraceroute(source, dest);
    console.log(result);
    document.getElementById(`${uuid}_status`).innerHTML = "Finished";
    await netbeam_table(result.traceroutes);
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
