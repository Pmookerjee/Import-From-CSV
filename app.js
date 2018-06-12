'use strict';

var data,
    pIDProject,
    pIDContract,
    pIDCustomer,
    pIDOrganization;

var sessionID = '';

Papa.parseCSV = function(file) {
  return new Promise(function(complete, error) {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete, error});
  });
};

function verifyHeaders(data) {
  var headers = data[0];

  //If a required header/column is missing, throw error and exit module
  if(!('IDProject' in headers) ||
     !('IDCustomer' in headers) ||
     !('IDOrganization' in headers) ||
     !('IDContract' in headers) ||
     !('BidItemName' in headers) || 
     !('LineItemName' in headers) ||
     !('BidItemDescription' in headers) ||
     !('LineItemDescription' in headers) ||
     !('ContractQuantity' in headers) ||
     !('Units' in headers) ||
     !('CostPerUnit' in headers) ||
     !('Total' in headers)
    ) 
    {
      $('#notification').removeClass("hidden").text("This file does not contain all the required fields");
      throw new Error('Exiting: min requirements not met')
    }    
  
  //save globals
  else {
    pIDProject = headers.IDProject;
    pIDCustomer = headers.IDCustomer;
    pIDOrganization = headers.IDOrganization;
    pIDContract = headers.IDContract;
  }    

}

function verifyExpectedGlobals(data) {

    function globalMatch(current, expected) {
      return current === expected ? true : false;
    }

    data.forEach(function(row) {
        if(!(globalMatch(row['IDProject'], pIDProject)) ||
          !(globalMatch(row['IDContract'], pIDContract)) ||
          !(globalMatch(row['IDCustomer'], pIDCustomer)) ||
          !(globalMatch(row['IDOrganization'], pIDOrganization)) 
          )
          {
            $('#notification').removeClass("hidden").text("Error: Project, Contract, Customer, and Org values must be consistent!");
            throw new Error('Error: Project, Contract, Customer, and Org values must be consistent!')
          }
    })

}

function createBidItems(data){

  return new Promise(function (complete, error) {

    var bidItems = [];
      data.forEach(function(item) {
          if(item['BidItemName']){
              var tmpName = item['BidItemName'];

              bidItems.push({
                GUIDBidItem: 'CSV-' + pIDProject + '-' + tmpName,
                Name: tmpName + ': ' + item['BidItemDescription'],
                Description: item['BidItemDescription'],
                IDProject: pIDProject,
                IDContract: pIDContract,
                IDCustomer: pIDCustomer
              });
          }
      });
      console.log('bid items is ', bidItems)
      complete(bidItems);
    })
}

function authenticate(api) {
  return new Promise(function(complete, error) {

    let agent = superagent.agent();

      agent.get(`${api}/1.0/Authenticate/marla/rocinante`)
        .set('Content-Type', 'application/json')
        .then(function(res){
          sessionID = res.body.SessionID;
          complete(res.body.SessionID);
        })
  })
}

function postBidItems(bidItems) {

  return new Promise(function (complete, error) {

    var API_URL = 'https://headlightqa.paviasystems.com';

    authenticate(API_URL)
      .then(function(cookie) {
         superagent.post(`${API_URL}/1.0/BidItems`)
          .set('Accept', 'application/json')
          .withCredentials(true)
          .set('cookie', cookie)
          .send(bidItems)
          .then(function(res) {
            console.log(`Posted ${bidItems.length} bid items`)
            complete(res.body);
          })
      })
  }) 
}

function postBidItemOrgJoins(bidItems) {

  return new Promise(function (complete, error) {

      var bidItemOrgJoins = [];

      bidItems.forEach(function(item) {
        bidItemOrgJoins.push({
          GUIDBidItemOrganizationJoin: item.GUIDBidItem + '-' + pIDOrganization,
          IDBidItem: item.IDBidItem,
          IDOrganization: pIDOrganization,
          IDCustomer: pIDCustomer
        })
      })
            
      var API_URL = 'https://headlightqa.paviasystems.com';

      superagent.post(`${API_URL}/1.0/BidItemOrganizationJoins`)
      .set('Accept', 'application/json')
      .withCredentials(true)
      .set('cookie', sessionID)
      .send(bidItemOrgJoins)
      .then(function(res) {
        console.log(`Posted ${bidItemOrgJoins.length} bid item org joins`)
        complete();
      })
  }) 
}

function handleFileSelect(e) {
  var file = e.target.files[0];

  Papa.parseCSV(file)
    .then(function(results) { 
      console.log('data: ', results); 
      verifyHeaders(results.data);
      return results.data;
    })
    .then(function(data) {
      verifyExpectedGlobals(data);
      return data;
    })
    .then(function(data) {
      return createBidItems(data);
    })
    .then(function(bidItemRequestData) {    
       return postBidItems(bidItemRequestData);
    })
    .then(function(bidItemResponseData) {
       return postBidItemOrgJoins(bidItemResponseData);
    })
    .then(function(){
      console.log('Done.')
    })
    .catch(function(err) {
      console.error(err)
    });
}

$(document).ready(function(){
  $("#importer").change(handleFileSelect);
});

