//const api_server = 'network-viz.chpc.utah.edu:8081'
// const api_server = '127.0.0.1:5000';
// const tr_api = '/api/v1/resources/traceroutes';

/**
 * Requests data from the API server.
 */
const runTraceroute = async (source, dest, num_runs) => {
    let api_call = `http://${config.api_server}${config.tr_api}?dest=${dest}`;
    if (source) {
        api_call += `&source=${source}`;
    }
    api_call += `&num_runs=${num_runs}`;
    // console.log(`Requesting ${api_call}`);
    try {
        // TODO: Look @ adding callback function to stop spinner
        return await d3.json(api_call);
    } catch (e) {
        // Return 'Network Error' if the request fails. This is displayed in the CR table.
        if (e instanceof TypeError) {
            // console.log('type error');
            return {'error': 'Network Error'};
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
        return {'results': []};
    }
}

/**
 * Get GRNOC Grafana chart url.
 * @param ip - IP address to lookup
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
    if (org !== null && org.toString() === 'Internet2')
    {
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
                    packets: new Array(),
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
            if (i > 0)
                entity.source_ids.add(`ip(${packets[i - 1].ip})`);
            if (i < packets.length - 1)
                entity.target_ids.add(`ip(${packets[i + 1].ip})`);
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
            result.set(cluster_id, new Proxy(({id: cluster_id, children: new Map()}), propHandler));
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

    // Filter orgs with only one.

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