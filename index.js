'use strict';

const request = require('request');
const async = require('async');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();


const serachVideos = (channelId, nextPageToken, callback) => {
	console.log('search videos:', channelId);

	let uri = 'https://www.googleapis.com/youtube/v3/search?channelId=' + channelId + '&key=' + process.env.YOUTUBE_API_KEY + '&part=id';

	if(nextPageToken){
		uri += '&pageToken=' + nextPageToken;
	}

	async.waterfall([
		(next) => {
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				let videoIds = body.items.filter(item => item.id.kind == 'youtube#video').map(item => item.id.videoId);

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
				return;
			}

			serachVideos(channelId, nextPageToken, callback);
		}
	]);
};


const getVideoViewCount = (videoIds, callback) => {
	let funcs = [];

	for(let i in videoIds){
		const videoId= videoIds[i];
		funcs.push((next) => {
			const uri = 'https://www.googleapis.com/youtube/v3/videos?id=' + videoId + '&key=' + process.env.YOUTUBE_API_KEY + '&part=snippet,statistics';
			console.log('get video:', videoId);
			request.get({ uri: uri, json: true }, (err, response, body) => {
				if(err){
					console.error(err);
					return;
				}

				//const date = new Date();
				const item = {
					VideoId: videoId,
					PublishedAt: body.items[0].snippet.publishedAt,
					VideoTitle: body.items[0].snippet.title,
					//ChannelId: body.items[0].snippet.channelId,
					ChannelTitle: body.items[0].snippet.channelTitle,
					ViewCount: body.items[0].statistics.viewCount,
					LikeCount: body.items[0].statistics.likeCount,
					DislikeCount: body.items[0].statistics.dislikeCount,
					Thumbnail: '=IMAGE("' + body.items[0].snippet.thumbnails.medium.url + '")'
				};

				next(null, item);
			});
		});

		funcs.push((item, next) => {
			const params = {
				TableName: 'YoutubeVideo', // DynamoDBのテーブル名
				Key: {
					VideoId: item.VideoId,
				},
				ExpressionAttributeNames: {
					'#pa': 'PublishedAt',
					'#vt': 'VideoTitle',
					'#ct': 'ChannelTitle',
					'#vc': 'ViewCount',
					'#lc': 'LikeCount',
					'#dc': 'DislikeCount',
					'#th': 'Thumbnail'
				},
				ExpressionAttributeValues: {
					':pa': item.PublishedAt,
					':vt': item.VideoTitle,
					':ct': item.ChannelTitle,
					':vc': item.ViewCount,
					':lc': item.LikeCount,
					':dc': item.DislikeCount,
					':th': item.Thumbnail
				},
				UpdateExpression: 'set #pa = :pa, #vt = :vt, #ct = :ct, #vc = :vc, #lc = :lc, #dc = :dc, #th = :th',
				Item: item
			};

			console.log('update: ', item);

			dynamoDB.update(params, (err) => {
				if(err){
					console.error(err);
					return;
				}

				next(null);
			});
		});
	}

	funcs.push(() => {
		callback();
	});

	async.waterfall(funcs);
};


const getChannelIds = (callback) => {
	const params = {
		TableName : 'Channel',
	};

	dynamoDB.scan(params, function(err, data) {
		if (err){
			console.error(err);
			return;
		}

		callback(data.Items);
	});
};


exports.handler = (event, context, callback) => {
	getChannelIds((items)=>{
		let funcs = [];
		const date = new Date();
		const hour = date.getHours();
		const minute = date.getMinutes();

		for(let i in items){
			if(i % 36 != (hour * 6 + parseInt(minute / 10)) % 36) continue;
			const channelId = items[i].ChannelId;
			funcs.push((next) => {
				serachVideos(channelId, null, () => {
					next();
				});
			});
		}

		funcs.push(() => {
			callback();
		});

		async.series(funcs);
	});
}
