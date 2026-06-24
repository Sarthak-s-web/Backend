import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadCloudinary } from "../utils/cloudinary.js";
import { APiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const generateAccessTokensandRefreshTokens= async(userId)=>{
try {
    const user= await User.findById(userId)
    const accessToken= user.generateAccessTokens()
    const refreshToken= user.generateRefreshTokens()

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false })
     return{
        accessToken,
        refreshToken
     };

} catch (error) {
    throw new ApiError(500, "Something went wrong and while generating access token and refresh token")
}
}

const registerUser= asyncHandler(async(req, res)=>
{
   //get user details from the frontend
   const {fullName, email, username, password} = req.body
//    console.log("email:", email);

   //validation -not empty
   if([fullName, email, username, password].some((fields)=>
     fields?.trim===""))
   {
        throw new ApiError(400, "All fields are required")
   }

   //check if user already exist: username,email
   const existedUser = await User.findOne({
    $or:[{email},{username}]
   })
   if(existedUser)
   {
    throw new ApiError(409,"User with email or username existed")
   }

   //check for images and avatar
   const avatarLocalPath = req.files?.avatar[0]?.path;
//    const coverImageLocalPath = req.files?.coverImage[0]?.path;

let coverImageLocalPath;
if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0)
{
    coverImageLocalPath=req.files.coverImage[0].path
}
   
   if(!avatarLocalPath)
   {
    throw new ApiError(400,"Avatar file not found");
   }

   //upload them to cloudinary,avatar
   const avatar= await uploadCloudinary(avatarLocalPath)
   const coverImage= await uploadCloudinary(coverImageLocalPath)

   if(!avatar)
   {
    throw new ApiError(400,"Avatar file not found");
   }

   //create user object- create entry in db
   const user= await User.create(
    {
        fullName,
        avatar:avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()

    })

   //remove password and refresh token field from response
   const createdUser= await User.findById(user._id).select(
       "-password -refreshToken"
   )
   
   //check for user creation
   if(!createdUser){
       throw new ApiError(500,"Something went wrong while registering the user");
   }

   //return response
    return res.status(201).json(
        new APiResponse(200, createdUser, "User registered Successfully")
    )

})


const loginUser= asyncHandler(async(req,res)=>{

    //req body->data
    //check by username or email
    //find user
    //password check
    //access and refresh token
    //send cookies

    const {username,email,password}= req.body;

    if(!username && !email)
    {
        throw new ApiError(404,"username or email not found")

    }
    const user = await User.findOne({
        $or:[{username},{email}]
    })

    if(!user)
    {
        throw new ApiError(404,"User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid)
    {
        throw new ApiError(404,"Invalid password")
    }

    const{accessToken, refreshToken} = await generateAccessTokensandRefreshTokens(user._id)
    const logedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options={
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new APiResponse(
            200,
            {
                user:logedInUser, 
                accessToken,refreshToken
            },
            "User logged In Successfully"
        )
    )

})

const logoutUser= asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            refreshToken:undefined
        },
        {
            new: true
        }
    )
    const options={
        httpOnly:true,
        secure:true
    }
    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(new APiResponse(200, {}, "User logged Out" ) )

})

const refreshAccesToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body

    if(!incomingRefreshToken)
    {
        throw new ApiError(401,"Unauthorized Access")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
        if(!user)
        {
            throw new ApiError(401,"Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken)
        {
            throw new ApiError(401,"Refresh token is expired or used")
        }
    
        const options={
            httpOnly:true,
            secure:true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessTokensandRefreshTokens(user._id)
    
        return res.
        status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new APiResponse(
                200,
                {
                    accessToken,
                    refreshToken: newRefreshToken
                },
                "Access Token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(error?.message || "Invalid refresh token")
    }

})


const changeCurrentPassword = asyncHandler(async(req,res)=>{

    const{oldPassword , newPassword} = req.body;
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect)
    {
        throw new ApiError(400,"Invalid old Password");
    }
    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.
    status(200)
    .json(new APiResponse(200,{},"Password Changed Successfully"))
})

const currentUser = asyncHandler(async(req, res)=>{
    return res
    .status(200)
    .json(new APiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails =asyncHandler(async(req, res)=>{
    const user = await User.findByIdAndUpdate(
        req.user?._id,
    {
        $set: fullName,
        email
    },
    { new:true }
).select("-password")

return res
.status(200)
.json( new APiResponse(200, user , "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req, res)=>{
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath)
    {
        throw new ApiError(400, "Avatar file is missing ")
    }
   const avatar = await uploadCloudinary(avatarLocalPath)
   if(!avatar.url)
   {
       throw new ApiError(400, "Error while uploading avatar") 
   }

   const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
        $set:{
            avatar : avatar.url
        }
    },

    {
        new:true
    }
   ).select("-password")
   return res
   .status(200)
   .json(new APiResponse(200, user, "Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverImageLocalPathLocalPath = req.file?.path
    if(!coverImageLocalPathLocalPath)
    {
        throw new ApiError(400, "Cover Image file is missing ")
    }
   const coverImage = await uploadCloudinary(coverImageLocalPathLocalPath)
   if(!coverImage.url)
   {
       throw new ApiError(400, "Error while uploading cover image") 
   }

   const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
        $set:{
            coverImage : coverImage.url
        }
    },

    {
        new:true
    }
   ).select("-password")

   return res
   .status(200)
   .json(new APiResponse(200, user, "Cover image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async(req, res)=>{
    const {username} = req.params;
    if(!username?.trim())
    {
        throw new ApiError(400, "user is missing")
    }

    const channel = await User.aggregate([
        {
            $match:{
                username:"username"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subcribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedTo:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        $if:{$in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                subcribersCount:1,
                channelsSubscribedTo:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])

    if(!channel?.length)
    {
        throw new ApiError(400, "channel does not exists")
    }

    return res
    .status(200)
    .json(
        new APiResponse(200 , channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory= asyncHandler(async(req, res)=>{
    const user = User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            },
        },    
        {
            $lookup:{
                    from:"videos",
                    localField:"watchHistory",
                    foreignField:"_id",
                    as:"watchHistory",
                    pipeline:[
                        {
                            $lookup:{
                                from:"users",
                                localField:"owner",
                                foreignField:"_id",
                                as:"owner",
                                pipeline:[
                                    {
                                        $project:{
                                            fullName:1,
                                            username:1,
                                            avatar:1 
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $addFields:{
                                owner:{
                                    $first:"$owner"
                                }
                            }
                        }
                    ]
                }
                
        }
        
    ])

    return res
    .status(200)
    .json(
        new APiResponse(
            200,
            user[0].watchHistory,
            "Watch History fetched successfully"
        ))
})


export { 
    registerUser,
    loginUser,
    logoutUser,
    refreshAccesToken,
    changeCurrentPassword,
    currentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
 } 
