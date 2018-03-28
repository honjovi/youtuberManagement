'use strict';

const request = require('request');
const async = require('async');
//const AWS = require("aws-sdk");
//const dynamoDB = new AWS.DynamoDB.DocumentClient();

const serachVideos = (channelId, nextPageToken, callback) => {
	let uri = "https://www.googleapis.com/youtube/v3/search?channelId=" + channelId + "&key=" + process.env.YOUTUBE_API_KEY + "&part=id";

	if(nextPageToken){
		uri += "&pageToken=" + nextPageToken;
	}

	async.waterfall([
		(next) => {
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				let videoIds = body.items.filter(item => item.id.kind == "youtube#video").map(item => item.id.videoId);

				next(null, videoIds, body.nextPageToken);
			});
		},
		(videoIds, nextPageToken, next)=>{
			getVideoViewCount(videoIds, () => {
				next(null, nextPageToken);
			});
		},
		(nextPageToken) => {
			if(!nextPageToken){
				callback();
			}

			serachVideos(channelId, nextPageToken, callback);
		}
	]);
};


const getVideoViewCount = (videoIds, callback) => {
	async.series([].concat(
		videoIds.map(videoId => (goNextVideo) => {
			const uri = "https://www.googleapis.com/youtube/v3/videos?id=" + videoId + "&key=" + process.env.YOUTUBE_API_KEY + "&part=snippet,statistics";
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				console.log(body.items[0].snippet.title, body.items[0].statistics.viewCount);

				goNextVideo();
			});
		}),
		() => {
			callback();
		}
	));
};


exports.handler = (event, context, callback) => {
	/*
	const params = {
		TableName: "Music", // DynamoDBのテーブル名
		Item: {
			"Artist": "GreatArtist",
			"SongTitle": "AwesomeSong",
		}
	}
	*/

	// DynamoDBへのPut処理実行
	/*
	dynamoDB.put(params).promise().then((data) => {
		console.log("Put Success");
		callback(null);
	}).catch((err) => {
		console.log(err);
		callback(err);
	});
	*/

	const channelId = "UClrYrddWLPz-18PyGK_ADPg";

	serachVideos(channelId, null, () => {
		callback();
	});
}
