var dgram = require('dgram')
  , net = require('net')
  , http = require('http')

var DOMAIN_MAP = {
    'api.xueqiu.com': '10.1.10.53'
  , 'js.xueqiu.com': '10.1.10.53'
  , 'assets.xueqiu.com': '10.1.10.53'
  , 'xueqiu.com': '10.1.10.53'
  , 'reality.distortion.field': '10.1.10.53'
}
var getDNS = (function () {
  var DNS = [
          '202.106.0.20'
        , '202.106.196.115'
        , '8.8.8.8'
        , '208.67.222.222'
        , '168.95.192.1'
      ]
    , l = DNS.length
    , i = 0
  return function () {
    i = (++i) % l
    return DNS[i]
  }
}())

function isQ1(buf) { // is it a dns query which QDCOUNT == 1
  if (buf.readUInt8(2) && parseInt('10000000', 2)) return false // it's not a dns query
  if ( buf.readUInt16BE(4) == 1  // QDCOUNT
    && buf.readUInt16BE(6) == 0  // ANCOUNT
    && buf.readUInt16BE(8) == 0  // NSCOUNT
    && buf.readUInt16BE(10) == 0 // ARCOUNT
    ) return true
  return false
}


function getDomain(buf) {
  var domain = ''
    , i = 0
    , length = buf[0]
  while (length) {
    i += 1
    domain += buf.slice(i, i + length).toString('utf8')
    i += length
    length = buf[i]
    if (length) domain += '.'
  }
  return domain
}
function domainHex(domain) {
  var parts = domain.split('.')
    , buf = new Buffer(4)
    , i
  for (i = 0; i < 4; i++) buf.writeUInt8(parseInt(parts[i], 10), i)
  return buf
}

var d = dgram.createSocket('udp4', dnsquery)
d.bind(53)

function returnQuery(msg, rinfo, domain) {
  console.log('return modified query: ' + domain + ' -> ' + DOMAIN_MAP[domain])
  var l = msg.length
    , id = msg.slice(0, 2)
    , buf = new Buffer(l + 16)
  msg.copy(buf)
  buf.writeUInt8(parseInt('10000000', 2) || (msg[2] && 1), 2) // set QR and RD bit
  buf.writeUInt8(parseInt('10000000', 2), 3) // set RA bit
  buf.writeUInt16BE(1, 6) // set ANCOUNT to 1
  buf.writeUInt16BE(parseInt('c00c', 16), l) // set answer NAME, same as QNAME
  buf.writeUInt16BE(1, l + 2) // set answer TYPE to A(1)
  buf.writeUInt16BE(1, l + 4) // set answer CLASS to IN(1)
  buf.writeUInt32BE(10, l + 6) // set answer TTL to 10 seconds
  buf.writeUInt16BE(4, l + 10) // set answer RDLENGTH to 4 for a ipv4 address
  domainHex(DOMAIN_MAP[domain]).copy(buf, l + 12) // set answer RDATA
  console.log(buf)
  d.send(buf, 0, l + 16, rinfo.port, rinfo.address)
}

function udp2tcp(msg) {
  var l = msg.length
    , b = new Buffer(l + 2)
  b.writeUInt16BE(l, 0)
  msg.copy(b, 2)
  return b
}

function tcp2udp(msg) {
  return msg.slice(2)
}

function dnsquery(msg, rinfo) {
  var id = msg.readUInt16BE(0).toString(16)
    , domain
  if (isQ1(msg)) return
  console.log('Got query         - ' + id)
  domain = getDomain(msg.slice(12))
  if (DOMAIN_MAP[domain]) {
    return returnQuery(msg, rinfo, domain)
  }
  console.log('Proxying query    - ' + id)
  console.log('  domain          - ' + domain)
  var s = new net.Socket({ type: 'udp4' })
  s.setTimeout(50000, function () {console.log('timeout')})
  s.on('data', function (msg) {
    console.log('Proxying response - ' + id)
    console.log('  domain          - ' + domain)
    var ip = msg.slice(msg.length - 4)
      , umsg = tcp2udp(msg)
      , ipp = []
    for (var i=0; i<4; i++) ipp.push(ip.readUInt8(i))
    console.log('  ip              - '  + ipp.join('.'))
    s.end()
    d.send(umsg, 0, umsg.length, rinfo.port, rinfo.address)
  })
  s.on('error', function (err) { console.log(err) })
  var dns = getDNS()
  console.log('  dns             - ' + dns)
  s.connect(53, dns)
  s.write(udp2tcp(msg))
}

http.createServer(function (req, res) {
  res.end("Hello there. I'm the Realty Distortion Field.")
}).listen(1955)
