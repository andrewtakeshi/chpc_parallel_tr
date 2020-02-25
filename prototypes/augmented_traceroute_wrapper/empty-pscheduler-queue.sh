host=$(hostname)
for url in $(curl --silent --insecure https://${host}/pscheduler/tasks | jq '.[]' | cut -d\" -f2)
do
    pscheduler cancel ${url}
done
