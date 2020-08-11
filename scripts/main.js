const width = 600;
const height = 600;

let entities = ({"traceroutes": []});

const btndemo = async (source, dest) => {
    console.log(source, dest);
    const result = await runTraceroute(source, dest);
    entities.traceroutes = entities.traceroutes.concat(result.traceroutes);
    let graph = await createInternetGraph(entities.traceroutes);
    let org_graph = clusterBy(graph,
                              (entity) => entity.org,
                              (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
                              "Org");
    return org_graph;
}

const demo = async (dest1, dest2) => {
    const result1 = await d3.json(`http://habanero.chpc.utah.edu:5000/api/v1/resources/traceroutes?dest=${dest1}`);
    const result2 = await d3.json(`http://habanero.chpc.utah.edu:5000/api/v1/resources/traceroutes?dest=${dest2}`);
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
