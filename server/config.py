import yaml

variables = {}

defaults = {
    'concurrent_run_current_limit': 10,
    'concurrent_run_future_limit': 15,
    'default_location': {
        'lat': 40.7637,
        'lon': -111.8475,
        'city': 'Salt Lake City',
        'region': 'UT'
    },
    'interface_file': 'interfaces.json',
    'interface_file_refresh_interval': 86400,
    'test': 'foo',
    'test2': 'bar'
}

with open('server_conf.yaml', 'r') as stream:
    for k, v in yaml.safe_load(stream).items():
        variables[k] = v

variables_keys = variables.keys()

for dk, dv in defaults.items():
    if dk not in variables_keys:
        variables[dk] = dv

print(variables)
