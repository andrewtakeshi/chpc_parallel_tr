# Install

pScheduler:
yum install -y http://software.internet2.edu/rpms/el7/x86_64/latest/packages/perfSONAR-repo-0.9-1.noarch.rpm
wget http://mirror.chpc.utah.edu/pub/software.internet2.edu/rpms/el7/x86_64/latest/packages/libperfsonar-perl-4.2.1-1.el7.noarch.rpm
yum install -y rpmrebuild
rpmrebuild -enp libperfsonar-perl-4.2.1-1.el7.noarch.rpm
#> Delete line: "Requires: GeoIP-data"
#> Save and quit: (vim) ESC :wq
#> Continue: y
yum localinstall -y rpmbuild/RPMS/noarch/libperfsonar-perl-4.2.1-1.el7.noarch.rpm
geoipupdate # Ran this just in case, may help with the missing deprecated geolocation packages
yum install -y perfsonar-testpoint



# pScheduler may still fail to run, if Globus software is on the machine.
# To fix this, download the `mod_wsgi` package from http://software.internet2.edu/rpms/el7/x86_64/latest/packages/
# And force-install it:
rpm -ivh mod_wsgi*.rpm

# Test
pscheduler troubleshoot
pscheduler troubleshoot --host=$(hostname)


#Globus CLI:
yum -y install python3-pip
python3 -m pip install globus-cli
