/^[0-9]+\s+[a-zA-Z0-9]/ {
    if ($2 == "No" && $3 == "Response") {
        printf "%2d  *\n", $1;
    }
    else {
        if ($3 ~ /\(([0-9]{1,3}\.){3}[0-9]{1,3}\)/) {
            ipv4addr=substr($3,2,length($3)-2);
            hostname=$2;
            rtt=$5;
        }
        else {
            ipv4addr=$2;
            hostname=ipv4addr;
            rtt=$4;
        }
        printf "%2d  %s (%s)  %.3f ms\n", $1, hostname, ipv4addr, rtt;
    }
}
