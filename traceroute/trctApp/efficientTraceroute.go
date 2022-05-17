package main

/*
{
  "traceroutes": [
    {
      "ts": 1648577507,
      "Source_address": "192.168.1.121",
      "Target_address": "8.8.8.8",
      "packets": [
        {
          "ttl": 0,
          "ip": "192.168.1.121",
          "rtt": 0
        },
        {
          "ttl": 1,
          "ip": "192.168.1.1",
          "rtt": 0.49
        }
      ]
    }
  ]
}
*/
import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
	"traceroute"
)

// Return the first non-loopback address as a 4 byte IP address. This address
// is used for sending packets out.
func socketAddr() (addr [4]byte, err error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return
	}

	for _, a := range addrs {
		if ipnet, ok := a.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if len(ipnet.IP.To4()) == net.IPv4len {
				copy(addr[:], ipnet.IP.To4())
				return
			}
		}
	}
	err = errors.New("You do not appear to be connected to the Internet")
	return
}

var srcIP [4]byte
var err error

/*
	A struct to hold the traceroute details
*/
type traceroutes struct {
	Ts            int    `json:"ts"`
	SourceAddress string `json:"source_address"`
	TargetAddress string `json:"target_address"`
	Packets       []packets
}

/*
	For each traceroute, a packet struct is defined to hold ttl, ip addr, and rtt.
*/
type packets struct {
	Ttl int     `json:"ttl"`
	Ip  string  `json:"ip"`
	Rtt float64 `json:"rtt"`
}

func storeHopPrint(hop traceroute.TracerouteHop) string {
	srcIP, err = socketAddr()
	sb := ""
	addr := fmt.Sprintf("%v.%v.%v.%v", hop.Address[0], hop.Address[1], hop.Address[2], hop.Address[3])
	sb += addr
	hostOrAddr := addr
	if hop.Host != "" {
		hostOrAddr = hop.Host
	}
	if hop.Success {
		//sb += fmt.Sprintf("%-3d %v (%v)  %v\n", hop.TTL, hostOrAddr, addr, hop.ElapsedTime)
		sb += fmt.Sprintf("%v/%v/%v/%v", hop.TTL, hostOrAddr, addr, hop.ElapsedTime)
	} else {
		sb += fmt.Sprintf("%v/%v/%v/%v", hop.TTL, "*", "*", "*")
	}

	return sb
}

func addr(address [4]byte) string {
	return fmt.Sprintf("%v.%v.%v.%v", address[0], address[1], address[2], address[3])
}

// func exec(ip string) string {
// 	str := ""
// 	flag.Parse()
// 	host := ip
// 	options := traceroute.TracerouteOptions{}
// 	options.SetRetries(*q - 1)
// 	options.SetMaxHops(*m + 1)
// 	options.SetFirstHop(*f)

// 	ipAddr, err := net.ResolveIPAddr("ip", host)
// 	if err != nil {
// 		return ""
// 	}

// 	//str += fmt.Sprintf("traceroute to %v (%v), %v hops max, %v byte packets\n", host, ipAddr, options.MaxHops(), options.PacketSize())
// 	fmt.Sprintf("traceroute to %v (%v), %v hops max, %v byte packets\n", host, ipAddr, options.MaxHops(), options.PacketSize())

// 	c := make(chan traceroute.TracerouteHop, 0)
// 	go func() {
// 		for {
// 			hop, ok := <-c
// 			if !ok {
// 				fmt.Println()
// 				return
// 			}
// 			str += storeHopPrint(hop)
// 			//At everystep the hop is being appended to the str. So instead of appending to the str, split the string by space into 4 sized array
// 			//and get the needed values and build an object.
// 			//fmt.Println("This is :" + str)
// 		}
// 	}()

// 	_, err = traceroute.Traceroute(host, &options, c)
// 	if err != nil {
// 		str += fmt.Sprintf("Error: ", err)
// 	}

// 	return str
// }
var m = flag.Int("m", 30, `Set the max time-to-live (max number of hops) used in outgoing probe packets (default is 64)`)
var f = flag.Int("f", traceroute.DEFAULT_FIRST_HOP, `Set the first used time-to-live, e.g. the first hop (default is 1)`)
var q = flag.Int("q", 0, `Set the number of probes per "ttl" to nqueries (default is one probe).`)

func exec(ip string) traceroutes {

	str := ""
	flag.Parse()
	host := ip
	options := traceroute.TracerouteOptions{}
	options.SetRetries(*q)
	options.SetMaxHops(*m + 1)
	options.SetFirstHop(*f)

	var counter int = 0
	ipAddr, err := net.ResolveIPAddr("ip", host)

	var trctObj traceroutes
	var byteIP [4]byte
	byteIP, err = socketAddr()
	var strIPSource string = ""
	strIPSource += fmt.Sprintf("%v.%v.%v.%v", byteIP[0], byteIP[1], byteIP[2], byteIP[3])
	trctObj.SourceAddress = strIPSource
	trctObj.TargetAddress = ipAddr.String()
	trctObj.Ts = int(time.Now().Unix())
	if err != nil {
		return trctObj
	}

	//str += fmt.Sprintf("traceroute to %v (%v), %v hops max, %v byte packets\n", host, ipAddr, options.MaxHops(), options.PacketSize())
	//fmt.Sprintf("traceroute to %v (%v), %v hops max, %v byte packets\n", host, ipAddr, options.MaxHops(), options.PacketSize())
	var pckt []packets
	c := make(chan traceroute.TracerouteHop, 0)
	go func() {
		for {
			var singlePckt packets
			hop, ok := <-c
			if !ok {
				fmt.Println()
				return
			}
			//At everystep the hop is being appended to the str. So instead of appending to the str, split the string by space into 4 sized array
			//and get the needed values and build an object.
			str = storeHopPrint(hop)
			//fmt.Println("this is initial: " + str)
			//fmt.Println(str)
			hopArray := strings.Split(str, "/")
			str = strings.Replace(str, str, "", len(str))
			//fmt.Println("String empty: " + str)
			// for _, v := range hopArray {
			// 	fmt.Println(v)
			// }
			singlePckt.Ttl = counter
			singlePckt.Ip = hopArray[2]

			var timeMs []string = strings.Split(hopArray[3], "ms")
			floatMs, _ := strconv.ParseFloat(timeMs[0], 64)
			singlePckt.Rtt = floatMs

			pckt = append(pckt, singlePckt)
			counter++
			//fmt.Println("This is :" + str)
		}
	}()

	_, err = traceroute.Traceroute(host, &options, c)
	if err != nil {
		str += fmt.Sprintf("Error: ", err)
	}

	trctObj.Packets = pckt

	return trctObj
}

func worker(jobs <-chan string, results chan<- traceroutes) {

	for n := range jobs {
		results <- exec(n)
	}
}

func main() {
	//Get the ip's from the parallel traceroute application
	//store it in an array.

	var targetAddress string
	var timesToRun int

	targetAddress = os.Args[1]
	strInt := os.Args[2]
	timesToRun, err = strconv.Atoi(strInt)

	if timesToRun == 0 {
		fmt.Println(err)
	}

	//make([]int,elems)
	var Traceroutes = make([]traceroutes, timesToRun)

	ipArr := [1]string{targetAddress}

	jobs := make(chan string, timesToRun)
	results := make(chan traceroutes, timesToRun)

	go worker(jobs, results)
	// go worker(jobs, results)
	// go worker(jobs, results)
	// go worker(jobs, results)
	// go worker(jobs, results)

	for i := 0; i < timesToRun; i++ {
		//fmt.Println(index)
		jobs <- ipArr[0]
	}
	close(jobs)

	/*
		traceroute to 8.8.4.4 (8.8.4.4), 31 hops max, 52 byte packets
		10.0.0.11   10.0.0.1 (10.0.0.1)  143.781151ms
		96.120.96.1532   96.120.96.153 (96.120.96.153)  319.379757ms
		96.110.232.1813   po-309-1312-rur102.saltlakecity.ut.utah.comcast.net. (96.110.232.181)  36.562374ms
		24.124.175.934   24.124.175.93 (24.124.175.93)  22.886438ms
		24.124.175.215   24.124.175.21 (24.124.175.21)  264.405133ms
		68.87.78.1786   68.87.78.178 (68.87.78.178)  16.376546ms
		1.1.1.17   one.one.one.one. (1.1.1.1)  500.389938ms
		10.0.0.18   10.0.0.1 (10.0.0.1)  105.284648ms
		8.8.4.49   dns.google. (8.8.4.4)  2.19425ms
	*/

	//var resultsArr [6]string
	//try to store results in a string array and pick info and change it to JSON !!!!!!!!!!! need to do it.
	for i := 0; i < timesToRun; i++ {
		Traceroutes[i] = <-results
	}
	data, _ := json.Marshal(Traceroutes)
	fmt.Println(`"traceroutes":` + string(data))
}
