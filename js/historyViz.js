var ht = {};

function buildHistoryViz(start, end) {
    var urlToHistoryItem = {};
    var urlToVisitItems = {};
	var relevantVisits = {};
	
	var rootVisits = {};
	var linkedVisits = {};

    var numRequestsOutstanding = 0;

	var json = {
		id: '-1',
		name: 'new tab',
		children: [],
	};
	//get all history items of the given timefrome
    chrome.history.search({
        'text': '',
        'startTime': start,
        'endTime': end,
        'maxResults': 1000000
    },
    function(historyItems) {

		// iterate over all retrieved historyitems
        jQuery.each(historyItems,
	        function(index, historyItem) {
				var url = historyItem.url;

				//creates a mapping of urls to their historyItems
			    urlToHistoryItem[url] = historyItem;
					
				// a closure to process each url with its visits
	            var doIt = function(url) {
	                return function(visitItems) {
	                    processVisits(url, visitItems);
	                };
	            };
	
	            chrome.history.getVisits({'url': url}, doIt(url));
	            numRequestsOutstanding++;
	        });
    });

	var createNodeFromVisitItem = function(item){
		return {
			'id': item.id,
			'name': cleanUrl(item.url),
			'children': [],
			'data':	{
				'link': [{'url':item.url,'title':urlToHistoryItem[item.url].title}],
				'url': item.url,
				'tooltip': urlToHistoryItem[item.url].title,
				'visitIds': [item.visitId]
			}
		};
	};
	
	var cleanUrl = function(url){
		//remove http:// or similiar
		var url = url.substr(url.indexOf('//') + 2); 
		// get rid of www.
		if(url.substr(0,4) == 'www.'){
			url = url.substr(4);
		}
		// return just the domain
		return url.substr(0, url.indexOf('/'));
	};
	
	//this is the callback to handle the visitItems that belongs to each url
    var processVisits = function(url, visitItems) {
		// iterate over all visitItems
        for (var i in visitItems) {		
            var item = visitItems[i];
			item["url"] = url;

            // check if the visit has taken place in the current timeframe
            if ((item.visitTime - start) > 0) {
			    relevantVisits[item.visitId] = item;
				
				// the first level of the hypertree shows the manually typed visits
				if(item.transition == "typed" 
					|| item.transition == "start_page"
					|| item.transition == "keyword"
					|| item.transition == "generated"
					|| item.transition == "auto_bookmark"
					|| (item.transition == "link" && item.referringVisitId == 0)
					){
					rootVisits[item.visitId] = item;
				}else if(item.transition == "link"
				 	|| item.transition == "form_submit"
					|| item.referringVisitId != 0
					){
					linkedVisits[item.visitId] = item;			
				}else{
					console.log(item.visitId + " dropped (" + item.transition + ") <- " + item.referringVisitId + item.url);
				}
            }
        }

        if (!--numRequestsOutstanding) {
			createTree();
            ht.loadJSON(json);
	        ht.refresh();
        }
    };
	var createTree = function(){
		var visitIdToNode = {};
		//iterate over all first level items
		for(var i in rootVisits){
			var newNode = createNodeFromVisitItem(rootVisits[i]);
			var sameNameFound = false;
			
			// check if there is a node belonging to the cleaned url
			for (var j=0; j < json.children.length; j++) {
				if(json.children[j].name == newNode.name){
					sameNameFound = true;

					var sameUrlFound = false;
					// check if the same url is already present
					for(var k in json.children[j].data.link){
						if(json.children[j].data.link[k].url == rootVisits[i].url || rootVisits[i].transition == 'link'){
							sameUrlFound = true;
							break;
						}
					}
					
					if(!sameUrlFound){
						var title = urlToHistoryItem[rootVisits[i].url].title || rootVisits[i].url;
						if(newNode.name == 'google.de'){
							// removes ' - Google Search'
							title = title.substr(0,title.length - 16);
						}
						json.children[j].data.link.push({'url':rootVisits[i].url,'title': title});
					}
					visitIdToNode[i] = json.children[j];
				}
			}
			
			// only add if it does not already exist
			if(!sameNameFound){
				visitIdToNode[i] = newNode;
				json.children.push(newNode);
			}
		}
		
		console.log(visitIdToNode)
		for(var visitId in linkedVisits){
			var parentNode = null;
			
			// take a look in the link items
			if(linkedVisits[linkedVisits[visitId].referringVisitId]){
				parentItem = linkedVisits[linkedVisits[visitId].referringVisitId]
				
			// check in the root nodes
			}else if(rootVisits[linkedVisits[visitId].referringVisitId]){
				parentItem = rootVisits[linkedVisits[visitId].referringVisitId]
			
			// if that did not get a match then there is no help!
			}else{
				console.log(linkedVisits[visitId].visitId + " lost <-" + linkedVisits[visitId].referringVisitId + linkedVisits[visitId].url);
				continue;
			}
			
			// retrieve the parent node
			var parentNode = null;
			// check if it already has been created
			if(visitIdToNode[parentItem.visitId]){
				parentNode = visitIdToNode[parentItem.visitId];
			// otherwise create it
			}else{
				parentNode = createNodeFromVisitItem(parentItem);
				visitIdToNode[parentItem.visitId] = parentNode;
			}
			
			// create the child node that turned up a match
			var childNode = createNodeFromVisitItem(linkedVisits[visitId]);
			visitIdToNode[visitId] = childNode;			
			
			var sameNameFound = false;
			for(var i = 0; i < parentNode.children.length; i++){
				if(parentNode.children[i].name == childNode.name){
					sameNameFound = true;
					break;
				}
			}
			if(parentNode.name !=  childNode.name && !sameNameFound){
				parentNode.children.push(childNode);
			}
		}
	}
}

//viz
var labelType, useGradients, nativeTextSupport, animate;

 (function() {
    var ua = navigator.userAgent,
    iStuff = ua.match(/iPhone/i) || ua.match(/iPad/i),
    typeOfCanvas = typeof HTMLCanvasElement,
    nativeCanvasSupport = (typeOfCanvas == 'object' || typeOfCanvas == 'function'),
    textSupport = nativeCanvasSupport
    && (typeof document.createElement('canvas').getContext('2d').fillText == 'function');
    //I'm setting this based on the fact that ExCanvas provides text support for IE
    //and that as of today iPhone/iPad current text support is lame
    labelType = (!nativeCanvasSupport || (textSupport && !iStuff)) ? 'Native': 'HTML';
    nativeTextSupport = labelType == 'Native';
    useGradients = nativeCanvasSupport;
    animate = !(iStuff || !nativeCanvasSupport);
})();

function init() {
    var infovis = document.getElementById('myViz');
    var w = infovis.offsetWidth - 10,
    h = infovis.offsetHeight - 10;

    //init Hypertree
    ht = new $jit.Hypertree({
        //id of the visualization container
        injectInto: 'myViz',
        //canvas width and height
        width: w,
        height: h,
        //Change node and edge styles such as
        //color, width and dimensions.
        Node: {
			overridable: true,
            dim: 8,
            color: "#AED0EA",
			removeHighlight: function(){
				if(this.activeNodeId){
					var n = ht.graph.getNode(this.activeNodeId);
				
					n.data['$type'] = 'circle';
					n.data['$color'] = this.color;
					n.data['$dim'] = this.dim;
					
					this.activeNodeId = null;
				}
			}
        },
        Edge: {
            lineWidth: 1,
            color: "#273B8E"
        },
		Labels: {
			type: 'HTML',
			size: 11,
			color: '#000'
		},
		Events:{
			enable: true,
			onDragMove: function(node, eventInfo, e){
					// var posRaw = ht.graph.getNode(node.id).pos.clone();
					// console.log(posRaw, posRaw.$scale(-0.4));
					// 
					// 
					// ht.move(posRaw.getc(true));
					// console.log(eventInfo, eventInfo.getPos(), e);
					// 	var mouse = new $jit.Complex(eventInfo.pos.x, eventInfo.pos.y);
					// 	console.log(mouse);
					// 	var newc = mouse.add(node.pos.getc());
					// 	console.log(newc,node);
					// console.log(node.pos, node.pos);
					
				//	ht.move(mouse);

			}
		},
		Tips: {  
		    enable: true,  
		    type: 'native',   
		    onShow: function(tip, node) {  
				node.data['$type'] = 'star';
				node.data['$color'] = '#f00';
				node.data['$dim'] = 12;
				this.highlightedNode = node;
				
				ht.plot();
				
				if(!ht.visiblePopup){
					setTimeout(function(){
						var label = $("#" + node.id + ".node");
						var p = $("#_popup") ;
						p.empty();
						for(var link in node.data.link){
							p.append(
								"<a href='" + node.data.link[link].url + "' target='_blank'>" 
									+ node.data.link[link].title
								+ "</a></br>");	
						}
						if(p.text().length > 0){
							p.css({
								'display': 'block',
								'top': label.offset().top + label.height()-3,
								'left': label.offset().left + label.width()
							});
						}					
					} ,800);
				}
				ht.visiblePopup = true
		    },
		  	onHide: function() {  
				var node = this.highlightedNode;
				
				setTimeout(function(){
					if(!ht.visiblePopup)
						$("#_popup").css({'display': ''});
					else
						console.log('canceled');
				}, 1000);
				ht.visiblePopup = false;
				node.data['$type'] = 'circle';
				node.data['$color'] = node.Node.color;
				node.data['$dim'] = node.Node.dim;
				ht.plot();
		    }
		},
        Navigation: {
            enable: true,
            panning: false
            // zooming: 20
        },
        //Attach event handlers and add text to the
        //labels. This method is only triggered on label
        //creation
        onCreateLabel: function(domElement, node) {
            domElement.innerHTML = node.name;
			// disable navigation for single nodes
			if($jit.Graph.Util.getSubnodes(node).length > 1 && node.id != -1){
				domElement.style.cursor = 'pointer';
	            $jit.util.addEvent(domElement, 'click',
		            function() {
						node.Node.removeHighlight();
						ht.onClick(node.id);
		            });            			
			}else{
				domElement.style.cursor = 'default';
			}
        },
        //Change node styles when labels are placed
        //or moved.
        onPlaceLabel: function(domElement, node) {
            var style = domElement.style;    
            if (node._depth <= 1) {
                style.fontSize = "0.8em";
                style.color = "#000";

            } else if (node._depth == 2) {
                style.fontSize = "0.7em";
                style.color = "#000";

            } else {
                style.fontSize = "0.5em";
                style.color = "#000";
            }

            var left = parseInt(style.left);
            var w = domElement.offsetWidth;
            style.left = (left - w / 2) + 'px';
        }
    });
}





