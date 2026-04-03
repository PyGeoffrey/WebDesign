let addNewLib = function(url, toinclude) {
	let newScript = document.createElement("script");
	newScript.src = url;
	document.getElementById(toinclude).before(newScript);
}
