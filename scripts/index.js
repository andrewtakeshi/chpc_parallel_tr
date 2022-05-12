/**
 * Utility functions and UI functions (i.e. frontend button handlers).
 *
 * @author Paul Fischer, Andrew Golightly, Cameron Davie
 */

// Keep separate lists for visible and hidden traceroutes.
let visibleTraces = ({"traceroutes": []});
let hiddenTraces = ({"traceroutes": []});

// Keep track of how many traceroutes are currently running.
let inQueue = 0;

/**
 * Handles pressing the reset button.
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
    visibleTraces.traceroutes = [];
    hiddenTraces.traceroutes = [];

    // Call to updateViz() removes the actual visualization
    return await updateViz();
}

/**
 * Used to create a new traceroute run card.
 * @param uuid - ID associated with the current run.
 * @param source - source address for current run
 * @param dest - dest address for current run
 * @param type - type of run, can be system or pScheduler
 * @param numRuns - the requested number of traceroute runs
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
                                ${numRuns} ${type} traceroute${numRuns === 1 ? `` : `s`}
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

    // let deck = document.getElementById('cr_deck');

    // Get run data from DOM
    let source = document.getElementById("esmond_ip_source").value;
    let dest = document.getElementById("esmond_ip_dest").value;
    let type = source ? "pScheduler" : "System";
    let numRuns = document.getElementById("esmond_num_runs").value;

    // Add new card with run data
    document.getElementById("cr_deck").append(cardMaker(uuid, source, dest, type, numRuns));
}

/**
 * Adds a timeout to the API calls - this can be adjusted from the config file.
 */
const timeout = (prom, time) => Promise.race([prom, new Promise((res) => setTimeout(
    () => res({'error': 'Timed out'}),
    time))]);

/**
 * Used to call clusterBy, but this has since been moved to the forcemap itself.
 *
 */
async function updateViz(traceroutes = visibleTraces.traceroutes) {
    let entities = new Map();

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
                // Set properties for each node
                entity = ({
                    id: entity_id,
                    ip: packet.ip,
                    org: packet.org,
                    domain: packet.domain,
                    ttl: packet.ttl,
                    max_bandwidth: packet.speed ? packet.speed : undefined,
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
}

/**
 * Handles checking/unchecking a box in the current run table.
 */
async function checkHandler(id, shown) {
    // List of entities to search and add to respectively
    let searchNTTs;
    let addNTTs;

    // If we are re-showing something, we want searchNTTs to be the list of currently hidden entities,
    // and we want to add our "found" entity to the list to show
    if (shown) {
        searchNTTs = hiddenTraces;
        addNTTs = visibleTraces;
        // Similarly, if we are hiding something we want searchNTTs to be the list of currently shown entities,
        // and we want to add our "found" entity to the list to hide
    } else {
        searchNTTs = visibleTraces;
        addNTTs = hiddenTraces;
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
 * Run traceroute button handler.
 *
 * Takes the source, the destination, the number of traceroutes to run, and a unique ID (generated by UUIDv4).
 */
async function e2eBtnHandler(source, dest, num_runs, uuid) {
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
    let result = await timeout(apiTracerouteRequest(source, dest, num_runs), source ? config.remote_timeout : config.system_timeout)
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
                    // Successful traceroute
                    // update the card title and color
                    document.getElementById(`${uuid}_status`).innerHTML = `${num_runs} ${source ? "pScheduler" : "System"} traceroute${num_runs === 1 ? "" : "s"}`;
                    document.getElementById(`${uuid}_card`).classList = "card bg-primary text-light mb-2";
                    // add a checkbox to toggle run visibility
                    let checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = true;
                    // Adjust background color of cards depending on checked value.
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

    // Update the visualization
    visibleTraces.traceroutes = visibleTraces.traceroutes.concat(result.traceroutes);
    return await updateViz();
}

/**
 * Change the displayed map.
 * @param selectedOption - Map to display (comes from map select dropdown 'value').
 */
function setTopojson(selectedOption) {
    // TODO: Add additional map options.
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
 * Toggles display of the map.
 */
async function toggleMapBtnHandler() {
    // todo: force nodes into correct positions after toggle; it's "close" right now but pretty far off.

    force_map.toggleMap();
    force_map.setSimulation();

    document.getElementById('map_toggle_btn').innerHTML = force_map.showMap ? '<i class="fas fa-project-diagram"></i> Network View' : '<i class="fas fa-map"></i> Map View';

    d3.select('#map_controls').classed("d-none", !force_map.showMap);

    force_map.update();
}

/**
 * Expands or collapses the nodes into their org/AS.
 */
async function toggleExpandASBtnHandler() {
    // TODO: Signalling from backend so this changes automatically if all the nodes are expanded.
    force_map.nodeExpansionToggle();
    document.getElementById('as_toggle_expand_btn').innerHTML = force_map.expanded ?
        '<i class="fas fa-circle"></i> Collapse All Orgs' :
        '<i class="fas fa-ellipsis-h"></i> Expand All Orgs';
}

/**
 * Handles changes to the map selector.
 */
async function mapSelectHandler() {
    let selectedOption = document.getElementById('map_select').value;
    setTopojson(selectedOption);
}

/**
 * Buffers events until a certain amount of time has passed. Prevents repeated sending of the same event, i.e. resize.
 * Borrowed from https://stackoverflow.com/questions/2854407/javascript-jquery-window-resize-how-to-fire-after-the-resize-is-completed
 */
const waitForFinalEvent = (function () {
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

/**
 * Handles disable/enable of zoom buttons, depending on current zoom level.
 * @param newZoom - the zoom level after the zoom action has taken place (i.e. zoom level after clicking the button).
 */
function checkZoomLevels(newZoom) {
    let extent = force_map.zoom.scaleExtent();
    // Fully zoomed out.
    if (newZoom === extent[0]) {
        d3.select('#zoom_in').attr('disabled', null);
        d3.select('#zoom_out').attr('disabled', true);
        d3.select('#zoom_reset').attr('disabled', true);
        // Fully zoomed in.
    } else if (newZoom === extent[1]) {
        d3.select('#zoom_in').attr('disabled', true);
        d3.select('#zoom_out').attr('disabled', null);
        d3.select('#zoom_reset').attr('disabled', null);
        // Somewhere in between.
    } else {
        d3.select('#zoom_in').attr('disabled', null);
        d3.select('#zoom_out').attr('disabled', null);
        d3.select('#zoom_reset').attr('disabled', null);
    }
}

/**
 * Requests data from the API server.
 *
 * @param source - If it's specified a remote traceroute will be run.
 * @param dest - Target of the traceroute.
 * @param num_runs - Number of concurrent traceroutes to run from source (or local machine, if source not specified) to
 * destination.
 */
async function apiTracerouteRequest(source, dest, num_runs) {
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
            return {'error': 'Network Error'};
        }
    }
};

// /**
//  * Create internet graph using "visible" entities (i.e. traces).
//  * @param traceroutes
//  * @returns {Promise<Map<any, any>>}
//  */
// async function createInternetGraph(traceroutes) {
//     let entities = new Map();
//
//     for (let trace of traceroutes) {
//         let packets = trace.packets;
//         for (let i = 0; i < packets.length; i++) {
//             if (packets[i].ip == undefined)
//                 packets[i].ip = `hop_${i}_${trace.id.substring(0, 5)}`;
//         }
//         for (let i = 0; i < packets.length; i++) {
//             const packet = packets[i];
//             packet.ts = trace.ts;
//             const entity_id = `ip(${packet.ip})`;
//             let entity = entities.get(entity_id);
//
//             if (!entity) {
//                 // Set properties for each node
//                 entity = ({
//                     id: entity_id,
//                     ip: packet.ip,
//                     org: packet.org,
//                     domain: packet.domain,
//                     ttl: packet.ttl,
//                     max_bandwidth: packet.speed ? packet.speed : undefined,
//                     packets: [],
//                     source_ids: new Set(),
//                     target_ids: new Set(),
//                     lat: packet.lat,
//                     lon: packet.lon,
//                     city: packet.city,
//                     region: packet.region
//                 });
//                 entities.set(entity_id, entity);
//             }
//
//             entity.packets.push(packet);
//
//             // Add the previous packet as a source and next packet as a target.
//             if (i > 0) {
//                 entity.source_ids.add(`ip(${packets[i - 1].ip})`);
//                 // for (let j = i - 1; j >= 0; j--) {
//                 //     if (packets[j].ttl !== packets[i].ttl) {
//                 //         let ttl = packets[j].ttl;
//                 //         while (packets[j].ttl === ttl) {
//                 //             entity.source_ids.add(`ip(${packets[j].ip})`);
//                 //             --j;
//                 //         }
//                 //         break;
//                 //     }
//                 // }
//             }
//             if (i < packets.length - 1) {
//                 entity.target_ids.add(`ip(${packets[i + 1].ip})`)
//                 // for (let j = i + 1; j < packets.length; j++) {
//                 //     if (packets[j].ttl !== packets[i].ttl) {
//                 //         let ttl = packets[j].ttl;
//                 //         while (packets[j].ttl === ttl) {
//                 //             entity.target_ids.add(`ip(${packets[j].ip})`);
//                 //             ++j;
//                 //         }
//                 //         break;
//                 //     }
//                 // }
//             }
//         }
//     }
//
//     return entities;
// }

/**
 * Look up appropriate property reducer for getting specific property from Proxy (i.e. Org).
 * @param property - Property to lookup
 * @returns {function(*, *): Set<*>} - Function specifying how to handle lookup of the property
 */
function propReducer(property) {
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
 * property across all children. Uses propReducer.
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
});

// Create the force map. By default the map is shown and we shown the world map.
const force_map = new ForceMap('#d3_vis');
setTopojson('world');

// Register the resize event.
$(window).resize(function () {
    // buffer the resize event to prevent recreating the force map hundreds of times/sec.
    waitForFinalEvent(function () {
        let newWidth = d3.select('#d3_vis').node().clientWidth;
        force_map.resize(newWidth, 0.5 * newWidth);
    }, 150, "windowResize");
});

