BEGIN {
    counter=0;
    if (!skipwhois && ("whois --version" |& getline))
        whois=1;
    else
        whois=0;

    tag="root";
    hop=0;
    if (!ignoreroot) {
        "hostname" |& getline hostname;
        "host "hostname |& getline dnsinfo;
        match(dnsinfo,/\S+/);
        hostname=substr(dnsinfo,RSTART,RLENGTH);
        match(dnsinfo,"([0-9]{1,3}\.){3}[0-9]{1,3}");
        ipv4addr=substr(dnsinfo,RSTART,RLENGTH);
        print "MERGE ("tag":Server {hostname:'"hostname"'}) SET "tag".ipv4addr='"ipv4addr"'";
        if (whois) {
            while ("whois "ipv4addr |& getline line && line !~ /^OrgName:/);
            match(line, /\s\S+.*/);
            orgname=substr(line,RSTART+1,RLENGTH);
            if (length(orgname))
                print "SET "tag".orgname='"orgname"'";
        }
    }
    intermediate_hops = 0;
}

/^\s*[0-9]+\s+/ {
    if ( $2 == "*" ) {
        intermediate_hops += 1;
    }
    else {
        prevtag=tag;
        prevrtt=rtt;
        prevhop=hop;
        hop=$1;
        if (prevhop > hop) {
            prevtag = "root";
            prevhop = 0;
            prevrtt = 0;
            intermediate_hops = 0;
            }
        tag="n"$2counter;
        counter += 1;
        gsub(/[\.-]/,"",tag);
        hostname=$2;
        match($3, "([0-9]{1,3}\.){3}[0-9]{1,3}");
        ipv4addr=substr($3,RSTART,RLENGTH);
        if (hostname == ipv4addr)
            print "MERGE ("tag":Server {ipv4addr:'"ipv4addr"'})";
        else
            print "MERGE ("tag":Server {hostname:'"hostname"'}) SET "tag".ipv4addr='"ipv4addr"'";

        print "SET "tag".visits=coalesce("tag".visits+1,1)"

        if (whois) {
            line="";
            while ("whois "ipv4addr |& getline line && line !~ /^OrgName:/);
            match(line, /\s\S+.*/);
            orgname=substr(line,RSTART+1,RLENGTH);
            if (length(orgname))
                print "SET "tag".orgname='"orgname"'";
        }

        rtt=$4;
        ping=(rtt-prevrtt > 0) ? rtt-prevrtt : 0.0;
        if( !(ignoreroot && prevtag == "root")) {
            print "MERGE ("prevtag")-[l"tag":LINK {intermediate_hops:"intermediate_hops"}]->("tag") SET l"tag".avg_latency=coalesce((l"tag".avg_latency+"ping")/2,"ping")";
        }
        intermediate_hops = 0;
    }
}

END {
    print ";";
}
