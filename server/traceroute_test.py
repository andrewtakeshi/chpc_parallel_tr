from server import d3_conversion
import time
import json
import traceroute

dest = '134.55.42.38'


# for i in range(1, 5):
#     print(f'Running {i} system traceroute(s) to {dest}')
#     start_time = time.time()
#     print('\tThreaded netbeam, using threaded subprocess')
#     d3_conversion.system_to_d3_old_threaded(dest, i)
#     print(f'\tTook {time.time() - start_time} seconds')
#     start_time = time.time()
#     print('\tThreaded netbeam, using icmplib traceroute')
#     d3_conversion.system_to_d3_threaded(dest, i)
#     print(f'\tTook {time.time() - start_time} seconds')

for i in range(1, 11):
    ret = d3_conversion.system_to_d3_old_threaded(dest, i)
    # ret = d3_conversion.system_to_d3_threaded(dest, i)
    print(json.dumps(ret))
    print(len(ret['traceroutes']))

# print(json.dumps(d3_conversion.system_to_d3_old_threaded(dest, 8)))
# print(json.dumps(d3_conversion.system_to_d3_threaded(dest, 8)))

