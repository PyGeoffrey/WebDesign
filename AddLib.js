let addNewLib = function(url) {
	let newScript = document.createElement("script");
	newScript.src = url;
	document.body.prepend(newScript);
}
