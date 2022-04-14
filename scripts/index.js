let visibleNTTs = ({ "traceroutes": [] });
let hiddenNTTs = ({ "traceroutes": [] });
// Timeout values - pscheduler is 25 sec, system is 10 sec
// const pscheduler_timeout = 25000;
// const system_timeout = 10000;
let inQueue = 0;

/**
 * Handles pressing the reset button. Calls updateViz() after reset.
 */
async function resetBtnHandler() {
    // Reset forms.
    let forms = $("form");
    for (let form of forms) {
        form.reset();
    }

    // Hide and clear tables on reset.
    document.getElementById("current_run_table_area").style.visibility = "hidden";
    // document.getElementById("netbeam_table_area").style.visibility = "hidden";
    document.getElementById("cr_table").getElementsByTagName('tbody')[0].innerHTML = "";
    // document.getElementById("netbeam_accordion").innerHTML = "";

    // Remove all old traceroute data
    visibleNTTs.traceroutes = [];
    hiddenNTTs.traceroutes = [];

    // Call to updateViz() removes the actual visualization
    return await updateViz();
}

/**
 * Used to create a new traceroute run card.
 * @param uuid - ID associated with the current run.
 * @param source - source address for current run
 * @param dest - dest address for current run
 * @param type - type of run, can be system or pScheduler
 * @param numRums - the requested number of traceroute runs 
 */
function cardMaker(uuid, source, dest, type, numRuns) {
    let newCard = document.createElement("div");
    newCard.id = id = `${uuid}_card`;
    newCard.classList = "card bg-light mb-2";
    newCard.innerHTML = `<div class="card-header d-flex justify-content-between align-items-center text-start">
                            <span id="${uuid}_status">
                                <div class="spinner-border spinner-border-sm" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                                ${numRuns} ${type} traceroute${numRuns == 1 ? `` : `s`}
                            </span>
                                <span id="${uuid}_controls">
                            </span>
                        </div>
                        <ul class="list-group list-group-flush">
                            <li class="list-group-item text-center">
                                ${source ? source : config.api_server} <i class="fas fa-arrow-right"></i> ${dest}
                            </li>
                        </ul>`
    return newCard;
}

/**
 * Adds a card to the current run deck.
 * @param uuid - ID associated with the current run.
 */
function addToCRDeck(uuid) {
    if (document.getElementById("esmond_ip_dest").value === "")
        return;

    document.getElementById("cr_deck").style.visibility = "visible";

    let deck = document.getElementById('cr_deck');

    // Get run data from DOM
    let source = document.getElementById("esmond_ip_source").value;
    let dest = document.getElementById("esmond_ip_dest").value;
    let type = source ? "pScheduler" : "System";
    let numRuns = document.getElementById("esmond_num_runs").value;

    // Add new card with run data
    document.getElementById("cr_deck").append(cardMaker(uuid, source, dest, type, numRuns));
}

/**
 * Adds a timeout to the API calls - this can be adjusted above
 */
const timeout = (prom, time) => Promise.race([prom, new Promise((res) => setTimeout(
    () => res({ 'error': 'Timed out' }),
    time))]);

/**
 * Packages the data in a way that is usable by the visualization (i.e. clustered into orgs)
 */
const updateViz = async () => {
    // Create new graph from
    let graph = await createInternetGraph(visibleNTTs.traceroutes);
    return clusterBy(graph,
        (entity) => entity.org,
        (entity) => new Set([...entity.source_ids, ...entity.target_ids]),
        "Org");
}

/**
 * Handles checking/unchecking a box in the current run table.
 */
const checkHandler = async (id, shown) => {
    // List of entities to search and add to respectively
    let searchNTTs;
    let addNTTs;

    // If we are re-showing something, we want searchNTTs to be the list of currently hidden entities,
    // and we want to add our "found" entity to the list to show
    if (shown) {
        searchNTTs = hiddenNTTs;
        addNTTs = visibleNTTs;
        // Similarly, if we are hiding something we want searchNTTs to be the list of currently shown entities,
        // and we want to add our "found" entity to the list to hide
    } else {
        searchNTTs = visibleNTTs;
        addNTTs = hiddenNTTs;
    }

    // Find all traceroutes with matching IDs and move them between the two lists accordingly.
    for (let i = 0; i < searchNTTs.traceroutes.length; ++i) {
        if (searchNTTs.traceroutes[i].id === id) {
            addNTTs.traceroutes.push(searchNTTs.traceroutes[i]);
            searchNTTs.traceroutes.splice(i, 1);
            --i;
        }
    }

    // Update the visualization - the checkhandler sets the data after this update.
    return await updateViz();
}


/**
 * Runs an end to end traceroute.
 */
const e2eBtnHandler = async (source, dest, num_runs, uuid) => {
    // Handle undefined destination
    if (dest === null || dest === undefined || dest === '') {
        return;
    }
    let updateInQueue = () => {
        let innerHTML = '';
        if (inQueue > 0) {
            innerHTML = `${inQueue} ${inQueue > 1 ? 'Traceroutes' : 'Traceroute'} Running`;
        }
        document.getElementById('inQueue_area').innerHTML = innerHTML;
        d3.select('#cr_deck_header').classed("d-none", false);
    }
    inQueue += parseInt(num_runs);
    updateInQueue();
    // Run the traceroute (with timeout)
    let result = await timeout(runTraceroute(source, dest, num_runs), source ? config.remote_timeout : config.system_timeout)
        .then(
            // OnFulfillment
            (value) => {
                inQueue -= parseInt(num_runs);
                updateInQueue();
                if (value.error) {
                    // This will be a timeout or pScheduler error
                    // change the appearance of the card
                    document.getElementById(`${uuid}_card`).classList = "card bg-warning mb-2";
                    document.getElementById(`${uuid}_status`).innerHTML = `<i class="fas fa-exclamation-triangle"></i> ` + value.error;
                    // add a button to remove the card
                    let removeCardBtn = document.createElement("button");
                    removeCardBtn.classList = "btn btn-sm btn-danger";
                    removeCardBtn.innerHTML = `<i class="fas fa-trash"></i>`;
                    removeCardBtn.onclick = (() => document.getElementById(`${uuid}_card`).remove());
                    document.getElementById(`${uuid}_controls`).appendChild(removeCardBtn);
                    return null;
                } else {
                    // update the card title and color
                    document.getElementById(`${uuid}_status`).innerHTML = `${num_runs} ${source ? "pScheduler" : "System"} traceroute${num_runs == 1 ? "" : "s"}`;
                    document.getElementById(`${uuid}_card`).classList = "card bg-primary text-light mb-2";
                    // add a checkbox to toggle run visibility
                    let checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = true;
                    checkbox.onchange = function () {
                        if (checkbox.checked) {
                            document.getElementById(`${uuid}_card`).classList = "card bg-primary text-light mb-2";
                        } else {
                            document.getElementById(`${uuid}_card`).classList = "card bg-light mb-2";
                        }
                        checkHandler(uuid, checkbox.checked).then(data => force_map.setData(data));
                    }
                    document.getElementById(`${uuid}_controls`).appendChild(checkbox);
                    return value;
                }
            },
            // If rejected we ran into an unknown error
            _ => {
                inQueue -= parseInt(num_runs);
                updateInQueue();
                document.getElementById(`${uuid}_status`).innerHTML = 'Unknown Error';
                return null;
            }
        );

    // Error occured - either timed out or pscheduler error
    if (result == null) {
        return;
    }

    // Every traceroute from this run is given the same ID to enable/disable them later
    for (let traceroute of result.traceroutes) {
        traceroute.id = uuid;
    }

    // Add to the netbeam table
    // await netbeamTable(result.traceroutes);

    // Update the visualization
    visibleNTTs.traceroutes = visibleNTTs.traceroutes.concat(result.traceroutes);

    return await updateViz();
}

/**
 * Change the displayed map.
 * @param selectedOption - Map to display (comes from map select dropdown 'value').
 */
function setTopojson(selectedOption) {
    let resourceString = '';
    switch (selectedOption) {
        case 'world':
            resourceString = 'resources/countries-50m.json';
            break;
        case 'us':
            resourceString = 'resources/states-10m.json';
            break;
        case 'eu':
            resourceString = 'resources/eu.json';
            break;
    }

    // Load the resource then perform any necessary filtering
    d3.json(resourceString).then(data => {
        data = topojson.feature(data, data.objects[Object.keys(data.objects)[0]]);

        // Remove US territories, Hawaii, and Alaska from the map
        if (selectedOption === 'us') {
            let remove_list = ['72', '78', '60', '66', '69', '15', '02'];
            for (let i = 0; i < data.features.length; i++) {
                let state = data.features[i];
                if (remove_list.includes(state.id)) {
                    data.features.splice(i, 1);
                    i--;
                }
            }
        }

        // Set the topography in the force_map, then draw it
        force_map.setTopography(data);
        force_map.toggleMap(force_map.showMap);
    });
}

/**
 * Hides or shows the map.
 */
const toggleMapBtnHandler = async () => {
    // todo: force nodes into correct positions after toggle; it's "close" right now but pretty far off.

    force_map.toggleMap();
    force_map.setSimulation();

    d3.select('#non_map_controls')
        .classed("col-sm-6", force_map.showMap)
        .classed("col-12", !force_map.showMap);
    
    d3.select('#viz_controls')
    .classed("row-cols-sm-2", force_map.showMap);

    d3.select('#map_controls')
        .classed("d-none", !force_map.showMap);

    force_map.update();
}

/**
 * Handles changes to the map selector.
 */
const mapSelectHandler = async () => {
    let selectedOption = document.getElementById('map_select').value;
    setTopojson(selectedOption);
}

/**
 * waiter
 * Borrowed from https://stackoverflow.com/questions/2854407/javascript-jquery-window-resize-how-to-fire-after-the-resize-is-completed
 */
let waitForFinalEvent = (function () {
    let timers = {};
    return function (callback, ms, uniqueId) {
        if (!uniqueId) {
            uniqueId = "Don't call this twice without a uniqueId";
        }
        if (timers[uniqueId]) {
            clearTimeout(timers[uniqueId]);
        }
        timers[uniqueId] = setTimeout(callback, ms);
    };
})();

$(window).resize(function () {
    waitForFinalEvent(function () {
        let newWidth = d3.select('#d3_vis').node().clientWidth;
        force_map.resize(newWidth, 0.5 * newWidth);
    }, 150, "windowResize");
});

function resizeHandler() {
    // document.getElementById('d3_vis').innerHTML = '';
    // force_map = new ForceMap('#d3_vis', force_map.geojson);
    // updateViz().then(data => force_map.setData(data));
    let force_parent = d3.select('#d3_vis').node();
    force_map.resize(force_parent.clientWidth, 0.5 * force_parent.clientWidth);
}

function checkZoomLevels(newZoom) {
    let extent = force_map.zoom.scaleExtent();
    if (newZoom === extent[0]) {
        d3.select('#zoom_out').attr('disabled', true);
        d3.select('#zoom_reset').attr('disabled', true);
        d3.select('#zoom_in').attr('disabled', null);
    } else if (newZoom === extent[1]) {
        d3.select('#zoom_in').attr('disabled', true);
        d3.select('#zoom_out').attr('disabled', null);
    } else {
        d3.select('#zoom_out').attr('disabled', null);
        d3.select('#zoom_in').attr('disabled', null);
        d3.select('#zoom_reset').attr('disabled', null);
    }
}

// Create the force map. By default the map is shown and we shown the world map.
const force_map = new ForceMap('#d3_vis');
setTopojson('world');




// 
// Auxillary functions for the forcemap 
// 

/**
 * Requests data from the API server.
 */
const runTraceroute = async (source, dest, num_runs) => {
    let api_call = `http://${config.api_server}${config.tr_api}?dest=${dest}`;
    if (source) {
        api_call += `&source=${source}`;
    }
    api_call += `&num_runs=${num_runs}`;
    try {
        // TODO: Look @ adding callback function to stop spinner
        return await d3.json(api_call);
    } catch (e) {
        // Return 'Network Error' if the request fails. This is displayed in the CR table.
        if (e instanceof TypeError) {
            return { 'error': 'Network Error' };
        }
    }
};

/**
 * Get max bandwidth from GRNOC.
 * @param ip - IP address, may or may not be part of GRNOC.
 * @param org - Org of IP address
 */
const getMaxBWFromGRNOCIP = async (ip, org) => {
    // TODO: Better way of telling if it's part of GRNOC - see also getATRChartURL
    // if (ip.startsWith('198') || ip.startsWith('162') || ip.startsWith('192')) {
    //     let api_call = `https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi?method=query;query=get%20max_bandwidth%20between(now-10m,%20now)%20from%20interface%20where%20interface_address.value%20=%20%22${ip}%22`;
    //     return await d3.json(api_call);
    // } else {
    //     return {'results': []};
    // }
    // TODO: Add additional orgs (i.e. SIX)
    if (org && org.toString() === 'Internet2') {
        let api_call = `https://snapp-portal.grnoc.iu.edu/tsds-cross-domain/query.cgi?method=query;query=get%20max_bandwidth%20between(now-10m,%20now)%20from%20interface%20where%20interface_address.value%20=%20%22${ip}%22`;
        return await d3.json(api_call);
    } else {
        return { 'results': [] };
    }
}

/**
 * Get GRNOC Grafana chart url.
 * @param ip - IP address to ltraceroute ruookup
 * @param org - Org of IP address
 * @returns URL of chart.
 */
const getATRChartURL = (ip, org) => {
    //(ip, org, start = 1588478400000, end = 1588564799000) => {
    // if (ip.startsWith('198') || ip.startsWith('162') || ip.startsWith('192')) {
    //     return `https://snapp-portal.grnoc.iu.edu/grafana/d-solo/f_KR9xeZk/ip-address-lookup?orgId=2&from=${start}&to=${end}&var-ip_addr=${ip}&panelId=2`;
    // }
    let end = Date.now();
    let start = end - 900000;

    // TODO: check this org stuff.
    if (org !== null && org.toString() === 'Internet2') {
        return `https://snapp-portal.grnoc.iu.edu/grafana/d-solo/f_KR9xeZk/ip-address-lookup?orgId=2&from=${start}&to=${end}&var-ip_addr=${ip}&panelId=2`;
    }
    return '';
}

/**
 * Create internet graph using "visible" entities
 * @param traceroutes
 * @param existing
 * @returns {Promise<Map<any, any>>}
 */
const createInternetGraph = async (traceroutes, existing = undefined) => {
    let entities = existing;
    if (entities == undefined) {
        entities = new Map();
    }

    for (let trace of traceroutes) {
        let packets = trace.packets;
        for (let i = 0; i < packets.length; i++) {
            if (packets[i].ip == undefined)
                packets[i].ip = `hop_${i}_${trace.id.substring(0, 5)}`;
        }
        for (let i = 0; i < packets.length; i++) {
            const packet = packets[i];
            packet.ts = trace.ts;
            const entity_id = `ip(${packet.ip})`;
            let entity = entities.get(entity_id);

            if (!entity) {
                let maxBW = undefined;
                const tsdsResult = await getMaxBWFromGRNOCIP(packet.ip, packet.org);
                if (tsdsResult.results.length > 0) {
                    maxBW = tsdsResult.results[0].max_bandwidth;
                }
                // Set properties for each node
                entity = ({
                    id: entity_id,
                    ip: packet.ip,
                    org: packet.org,
                    domain: packet.domain,
                    ttl: packet.ttl,
                    max_bandwidth: packet.speed ? packet.speed : maxBW,
                    packets: [],
                    source_ids: new Set(),
                    target_ids: new Set(),
                    lat: packet.lat,
                    lon: packet.lon,
                    city: packet.city,
                    region: packet.region
                });
                entities.set(entity_id, entity);
            }

            entity.packets.push(packet);

            // Add the previous packet as a source and next packet as a target.
            if (i > 0) {
                entity.source_ids.add(`ip(${packets[i - 1].ip})`);
                // for (let j = i - 1; j >= 0; j--) {
                //     if (packets[j].ttl !== packets[i].ttl) {
                //         let ttl = packets[j].ttl;
                //         while (packets[j].ttl === ttl) {
                //             entity.source_ids.add(`ip(${packets[j].ip})`);
                //             --j;
                //         }
                //         break;
                //     }
                // }
            }
            if (i < packets.length - 1) {
                entity.target_ids.add(`ip(${packets[i + 1].ip})`)
                // for (let j = i + 1; j < packets.length; j++) {
                //     if (packets[j].ttl !== packets[i].ttl) {
                //         let ttl = packets[j].ttl;
                //         while (packets[j].ttl === ttl) {
                //             entity.target_ids.add(`ip(${packets[j].ip})`);
                //             ++j;
                //         }
                //         break;
                //     }
                // }
            }
        }
    }

    return entities;
};

/**
 * clusterBy takes a map of entities with an 'id' property and returns a map of new entities that reference
 * the input entities as children. Clustering is breadth-first driven by the given label equality, degree,
 * and relationship parameters.
 */
const clusterBy = (entities, getLabel, getRelationships, id_prefix = undefined, max_degree = 1) => {
    const result = new Map();

    // Helper method for cleanliness
    const addToCluster = (cluster_id, entity) => {
        if (!result.has(cluster_id)) {
            // Use ES6 Proxy to recursively access properties of hierarchical clusters (see `handler` def)
            result.set(cluster_id, new Proxy(({ id: cluster_id, children: new Map() }), propHandler));
        }
        // Set the children of the proxy to be the actual entity.
        result.get(cluster_id).children.set(entity.id, entity);
    }

    const orphan_ids = [...entities.keys()];
    const cluster_count = new Map();

    let i = 0;
    while (i < orphan_ids.length) {
        // Start a new cluster from an unclustered entity
        const orphan = entities.get(orphan_ids[i]);

        // label is the org label - lambda passed by calling function
        const label = getLabel(orphan);

        // Disjoint clusters of the same label are enumerated for distinctness
        if (!cluster_count.has(label))
            cluster_count.set(label, 0);
        cluster_count.set(label, cluster_count.get(label) + 1);

        // cluster_id is the id_prefix + org (label) + cluster count
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
                    // Found a match, add to result
                    addToCluster(cluster_id, candidate);

                    // getRelationships is a lambda that returns a set of the source ids and target ids?
                    const neighbors = Array.from(getRelationships(candidate));

                    // Add neighbors as new search candidates
                    candidates = candidates.concat(neighbors);

                    // TODO add support for max_degree > 1 (recursive neighbors), probably change candidates to a Set at
                    //  the same time

                    // This entity now belongs to a cluster, so we remove orphans
                    orphan_ids.splice(orphan_ids.indexOf(candidate_id), 1);
                }
            }
        }
    }
    return result;
};

/**
 * Look up appropriate property reducer for getting specific property from Proxy (i.e. Org).
 * @param property - Property to lookup
 * @returns {function(*, *): Set<*>} - Function specifying how to handle lookup of the property
 */
const propReducer = (property) => {
    let f = null;
    switch (property) {
        case 'source_ids':
        case 'target_ids':
            f = (a, b) => new Set([...a, ...b]);
            break;
        case 'packets':
            f = (a, b) => a.concat(b);
            break;
        // Add in case of lat and lon; then we take average later inside of 'handler'
        case 'lat':
        case 'lon':
            f = (a, b) => a + b;
            break;
        case 'city':
        case 'region':
            f = (a, b) => a === b ? a : 'Avg. Location';
            break;
        case 'max_bandwidth':
            // I think min is best because it gives the most restricted view; not positive though.
            // Return the minimum bandwidth for the node - defaults to 0 if a bandwidth is undefined
            f = (a, b) => Math.min(a ? a : 0, b ? b : 0);
            break;
        case 'ttl':
            f = (a, b) => Math.min(a, b);
            break;
        default:
            f = (a, b) => a === b ? a : undefined;
    }
    return f;
}

/**
 * If property is not present and the object has an array of child nodes, return an appropriate reduction of that
 * property across all children
 */
const propHandler = ({
    get: (obj, property) => {
        if (property in obj) {
            return obj[property]
        } else if (obj.children) {
            let children = Array.from(obj.children.values());
            let retVal = children.map(child => child[property])
                // propReducer returns the appropriate function for the reduction.
                .reduce((accumulator, value) => propReducer(property)(accumulator, value));

            // Return average value in case of lat or lon - can't be done as part of reduce.
            return (property === 'lat' || property === 'lon') ?
                (retVal / children.length) : retVal;
        }
        return undefined;
    }
})