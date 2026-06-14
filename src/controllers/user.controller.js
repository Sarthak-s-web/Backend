import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadCloudinary } from "../utils/cloudinary.js";
import { APiResponse } from "../utils/ApiResponse.js";

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


export { registerUser } 
