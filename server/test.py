
from server import d3_conversion as d3c
from server import d3_conversion_utils
from server import d3_netbeam
import time
import difflib
import datetime

# diff = difflib.Differ()
#
# dest = '8.8.8.8'
# dest = '155.101.8.18'
#
# st = time.time()
# old = d3c.system_to_d3_old(dest, 10)
# print(time.time() - st)
# st = time.time()
# new = d3c.system_to_d3_old_threaded(dest, 10)
# print(time.time() - st)
#
# print(old)
# print(new)

# print(d3_conversion_utils.ip_to_geo('155.101.8.18'))

print(d3c.system_to_d3_old('8.8.8.8'))



