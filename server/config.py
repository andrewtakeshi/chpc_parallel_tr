import yaml

# Load sane defaults, will be replaced by the file.
variables = {
    'concurrent_run_limit': 10,
    'default_location': {
        'lat': 40.7637,
        'lon': -111.8475,
        'city': 'Salt Lake City',
        'region': 'UT'
    },
    'interface_file': 'interfaces.json',
    'sd_interface_file': 'sd_interfaces.json',
    'interface_refresh_interval': 86400
}

# Need the server/... when running as part of flask; not needed when running directly.
# Load new values.
with open('config.yaml', 'r') as stream:
# with open('../config.yaml', 'r') as stream:
    confs = yaml.safe_load_all(stream)
    for k, v in next(confs).items():
        variables[k] = v