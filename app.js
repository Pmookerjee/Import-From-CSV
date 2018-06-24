'use strict';

var origCsvData,
    pIDProject,
    pIDContract,
    pIDCustomer,
    pIDOrganization;

var sessionID = '';

function checkForError(obj) {
  return obj.Error;
}

function failPromise(errors, request) {
  console.log('Errors: ', errors);
  fail(`Error occurred while posting to ${request}`)
}

//parse the csv file into an array of objects, preserving type
Papa.parseCSV = function(file) {
  return new Promise(function(complete, error) {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      complete, error});
  });
};

//make sure the right columns are included 
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

//make sure all the global columns have the same value
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
  return new Promise(function(complete, fail) {

     let agent = superagent.agent();

      agent.get(`${api}/1.0/Authenticate/marla/rocinante`)
        .withCredentials()
        .then(function(res){
          sessionID = res.body.SessionID;
          complete(sessionID);
        })
  })
}

function postBidItems(bidItems) {

  return new Promise(function (complete, fail) {

    var API_URL = 'https://headlightqa.paviasystems.com';

    authenticate(API_URL)
      .then(function(cookie) {
         superagent.post(`${API_URL}/1.0/BidItems`)
          .withCredentials()
          .auth('Authorization', cookie, {type:'auto'})
          .set({'Content-Type': 'application/json'})
          .send(bidItems)
          .then(function(res) {
            var errors  = res.body.filter(checkForError); 
            
            if(errors.length){
              console.log('Errors: ', errors);
              fail('Error occurred while posting bid item org joins')
            }
            else {
              console.log(`Posted ${bidItems.length} bid items`);
              complete(res.body);
            }
          })
      })
  }) 
}

function postBidItemOrgJoins(bidItems) {

  return new Promise(function (complete, fail) {

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
      .auth('Authorization', sessionID, {type:'auto'})
      .send(bidItemOrgJoins)
      .then(function(res) {
          var errors  = res.body.filter(checkForError); 

          if(errors.length){
            console.log('Errors: ', checkForError);
            fail('Error occurred while posting bid item org joins')
          }
          else {
            console.log(`Posted ${bidItemOrgJoins.length} bid item org joins`);
            complete(bidItems);
          }
      })
  }) 
}

function createLineItems(bidItems){

  return new Promise(function (complete, fail) {

    var bidItemLookup = _.indexBy(bidItems, 'Description');
    var lineItems = [];

    origCsvData.forEach(function(item) {
          
        var name = item['LineItemName'];
        var tmpCode = item['LineItemCode'];

        var lineItemCode = (tmpCode && tmpCode.length) ? tmpCode : name.match(/^[A-Z]*[-: ]*\d+-?\d*/g);    
        var guid = 'CSV-' + pIDProject + '-' + lineItemCode;

        lineItems.push({
          GUIDLineItem: guid,
          Name: name,
          Description: item['LineItemDescription'],
          IDBidItem: bidItemLookup[item['LineItemDescription']].IDBidItem,
          Units: item['Units'],
          CostPerUnit: (item['CostPerUnit'] + '').replace('$', ''),
          ExpectedQuantity: item['ContractQuantity'],
          ContractQuantity: item['ContractQuantity'],
          CategoryNumber: item['CategoryNumber'] || '',
          FundingCategory: item['FundingCategory'] || '',
          Tax: item['Tax'] || 0.0,
          IDProject: pIDProject,
          IDCustomer: pIDCustomer
        });
          
      });
      complete([bidItems, lineItems]);
    })
}

function postLineItems([bidItems, lineItems]) {

  return new Promise(function (complete, fail) {

    var API_URL = 'https://headlightqa.paviasystems.com';

      superagent.post(`${API_URL}/1.0/LineItems`)
      .withCredentials()
      .auth('Authorization', sessionID, {type:'auto'})
      .set({'Content-Type': 'application/json'})
      .send(lineItems)
      .then(function(res) {
          var errors  = res.body.filter(checkForError); 

          if(errors.length){
            console.log('Errors: ', errors);
            fail('Error occurred while posting line items')
          }
          else {
            console.log(`Posted ${lineItems.length} line items`);
            complete([bidItems, res.body]);
          }
      })
  }) 
}

function postLineItemOrgJoins([bidItems, lineItems]) {

  return new Promise(function (complete, fail) {

      var lineItemOrgJoins = [];

      lineItems.forEach(function(item) {
        lineItemOrgJoins.push({
          GUIDLineItemOrganizationJoin: item.GUIDLineItem + '-' + pIDOrganization,
          IDLineItem: item.IDLineItem,
          IDOrganization: pIDOrganization,
          IDCustomer: pIDCustomer
        })
      })
            
      var API_URL = 'https://headlightqa.paviasystems.com';

      superagent.post(`${API_URL}/1.0/LineItemOrganizationJoins`)
      .set('Accept', 'application/json')
      .withCredentials(true)
      .auth('Authorization', sessionID, {type:'auto'})
      .send(lineItemOrgJoins)
      .then(function(res) {
        var errors  = res.body.filter(checkForError); 

        if(errors.length){
          console.log('Errors: ', errors);
          fail('Error occurred while posting line items joins')
        }
        else {
          console.log(`Posted ${lineItemOrgJoins.length} line item org joins`);
          complete([bidItems, res.body]);
        }
      })
  }) 
}


function handleFileSelect(e) {
  var file = e.target.files[0];

  Papa.parseCSV(file)
    .then(function(results) { 
      console.log('Beginning csv import...\ndata: ', results); 
      verifyHeaders(results.data);
      origCsvData = results.data;
      return origCsvData;
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
    .then(function(bidItems) {
       return createLineItems(bidItems);
    })
    .then(function(lineItemRequestData) {
      return postLineItems(lineItemRequestData);
    })
    .then(function(lineItemResponseData) {
      return postLineItemOrgJoins(lineItemResponseData);
    })
    // .then(function() {
    //   return 
    // })
    .then(function(){
      console.log('CSV import complete.')
    })
    .catch(function(err) {
      console.error(err)
    });
}

$(document).ready(function(){
  $("#importer").change(handleFileSelect);
});

